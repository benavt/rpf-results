"""Export saved single-model RPF diagnostics; never prepare or score structures.

Requires the existing strict RPF parser and lossless archive reader. The private
source plan pins accepted runs, their audits, the model index and parser source.
Only public identities and residue annotations are written to the site bundle.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(path, expected):
    raw = Path(path).read_bytes()
    if sha(raw) != expected:
        raise ValueError("Source identity differs: " + str(path))
    return raw


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()


def export(plan_path, source, output, limit=None):
    started = time.monotonic()
    plan_raw = plan_path.read_bytes()
    plan = json.loads(plan_raw)
    for name, expected in plan["source_files"].items():
        checked(source / name, expected)
    sys.path.insert(0, str(source / "src"))
    from rpf_browser.residue_metrics import build_layers, residue_mapping
    from rpf_pilot.compact import read_manifest

    models = json.loads(checked(plan_path.parent / "models.json", plan["models_sha256"]))
    if len(models) != len({m["id"] for m in models}) or len(models) != plan["models"]:
        raise ValueError("Model inventory differs")
    owners = {}
    sources = []
    for entry in plan["runs"]:
        root = Path(entry["run"])
        checked(root / "run.json", entry["snapshot_sha256"])
        audit = json.loads(checked(root / "04_analysis/completion-audit.json", entry["audit_sha256"]))
        if audit["input_version"] != plan["input_version"] or audit["control_variant"] != "tr-original-control":
            raise ValueError("Experimental input identity differs")
        binding = json.loads((root / "01_staging/payload/rpf-binding.json").read_text())
        for name in ("store", "codec"):
            checked(binding[name], plan["binary_sha256"][name])
        for mid, digest in audit["result_files_sha256"].items():
            if mid in owners:
                raise ValueError("Duplicate accepted model")
            owners[mid] = (root, digest, binding)
        sources.append({k: entry[k] for k in ("snapshot_sha256", "audit_sha256")})
    if {m["id"] for m in models} != owners.keys():
        raise ValueError("Accepted sources do not cover the published cohort exactly")
    output.mkdir(parents=True, exist_ok=False)
    data_dir = output / "model-diagnostics"
    data_dir.mkdir()
    index = dict(schema_version=1, kind="independent_model_residue_diagnostics",
                 score_context="independent_single_model", input_version=plan["input_version"],
                 control_variant="tr-original-control", models=len(models), scientific_calls=0,
                 model_index_sha256=plan["models_sha256"], source_plan_sha256=sha(plan_raw),
                 source_audits=sources, projection_source_sha256=plan["source_files"]["src/rpf_browser/residue_metrics.py"],
                 chemical_shifts_sha256=plan["chemical_shifts_sha256"], coordinate_packs={},
                 layers=[], residues=[], limitations=["Residue precision diagnostics from each independent scored model; no local Recall, Precision fraction or DP is inferred.",
                     "Unassigned-proton residues are unavailable rather than zero."])
    batches = {}
    for model in models[:limit] if limit else models:
        batches.setdefault(model["structure"]["path"], []).append(model)
    done = 0
    for pack_path, batch in batches.items():
        packed = {}
        for model in batch:
            mid = model["id"]
            root, result_sha, binding = owners[mid]
            result = json.loads(checked(root / "03_filtering" / mid / "result.json", result_sha))
            if result["model_id"] != mid or result["query_sha256"] != model["structure"]["sha256"] or result["status"] != "scored":
                raise ValueError("Scored coordinate identity differs")
            for field, native in (("dp", "DP"), ("recall", "Recall"), ("precision", "Precision")):
                if result["RPF"][native] != model[field]:
                    raise ValueError("Published score differs from accepted model")
            archive = root / result["archive_file"]
            checked(archive, result["archive"]["archive_sha256"])
            manifest = read_manifest(archive, Path(binding["store"]))
            wanted = ("native/sr215_DP.QP.rptb", "query.pdb", "working-inputs/sr215.bmrb")
            rows = {r["path"]: r for r in manifest["files"] if r["path"] in wanted}
            if set(rows) != set(wanted) or any(r["representation"] != "raw" for r in rows.values()):
                raise ValueError("Unsupported saved diagnostic representation")
            with tempfile.TemporaryDirectory(prefix="rpf-residue-read-") as scratch:
                scratch = Path(scratch)
                subprocess.run([binding["store"], "unpack", str(archive), str(scratch / "objects"),
                                *sorted({r["object"] for r in rows.values()})], check=True, capture_output=True, timeout=60)
                raw = {name: checked(scratch / "objects" / row["object"], row["sha256"]) for name, row in rows.items()}
                if sha(raw["query.pdb"]) != model["structure"]["sha256"] or sha(raw["working-inputs/sr215.bmrb"]) != plan["chemical_shifts_sha256"]:
                    raise ValueError("Saved structure or shift table differs")
                encoded = scratch / "qp.rptb"
                encoded.write_bytes(raw["native/sr215_DP.QP.rptb"])
                qp_file = scratch / "qp.txt"
                subprocess.run([binding["codec"], "decode", str(encoded), str(qp_file)], check=True, capture_output=True, timeout=60)
                qp = qp_file.read_bytes()
            pdb, shifts = raw["query.pdb"].decode(), raw["working-inputs/sr215.bmrb"].decode()
            mapping = residue_mapping(pdb)
            if len(mapping) != 139 or sha("".join(v["residue"] for _, v in sorted(mapping.items())).encode()) != plan["sequence_sha256"]:
                raise ValueError("Construct identity differs")
            diagnostic = build_layers(qp.decode(), pdb, shifts, run_id=mid)
            layers = diagnostic["layers"]
            residues = [{k: v for k, v in r.items() if k not in ("value", "color")} for r in layers[0]["values"]]
            if not index["layers"]:
                index["residues"] = residues
                index["layers"] = [{k: v for k, v in layer.items() if k not in ("values", "shared_across_models", "scope_label", "native_model_context")} for layer in layers]
                for layer in index["layers"]:
                    layer.update(scope="model", scope_label="Independent single-model diagnostic", native_model_context="Single scored model")
                    if layer["id"] in ("precision_violation_groups", "short_precision_violation_groups"):
                        layer.pop("domain")
            elif residues != index["residues"]:
                raise ValueError("Residue or assignment mapping differs between models")
            packed[mid] = dict(query_sha256=model["structure"]["sha256"], result_sha256=result_sha,
                               native_archive_sha256=result["archive"]["archive_sha256"], native_qp_sha256=sha(qp),
                               values=[[r["value"] for r in layer["values"]] for layer in layers],
                               heat_colors=[r["color"] for r in layers[0]["values"]])
            done += 1
        name = Path(pack_path).name.split(".")[0] + ".json.gz"
        encoded = gzip.compress(dump(dict(schema_version=1, score_context="independent_single_model", models=packed)), mtime=0)
        (data_dir / name).write_bytes(encoded)
        index["coordinate_packs"][pack_path] = dict(path="current/model-diagnostics/" + name,
                                                    sha256=sha(encoded), bytes=len(encoded), models=len(packed))
        print(json.dumps(dict(exported=done, total=len(models), elapsed_seconds=round(time.monotonic() - started, 1))), flush=True)
    if limit:
        index["models"] = done
    (output / "model-diagnostics.json").write_bytes(dump(index) + b"\n")
    (output / "export-audit.json").write_bytes(dump(dict(status="validated", models=done, scientific_calls=0,
        source_plan_sha256=sha(plan_raw), files={str(p.relative_to(output)):dict(bytes=p.stat().st_size, sha256=sha(p.read_bytes()))
            for p in output.rglob("*") if p.is_file()})) + b"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--rpf-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    export(args.plan, args.rpf_source, args.output, args.limit)
