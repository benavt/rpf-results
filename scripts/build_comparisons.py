"""Export accepted SR215 comparison tables without running scientific programs.

Usage: python3 scripts/build_comparisons.py --source-root /path/to/RPF
Only hash-verified output tables are admitted. Private native-output paths are
excluded by the explicit public schema. Existing coordinate packs stay unchanged.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from collections import defaultdict
from pathlib import Path

PEAKS = "SR215-TR-2026-11-06-v1"
STUDIES = [
    ("states", "State ensembles", "sr215-current-state-panels", "panels.csv", "selected-models.csv", 48, 12104),
    ("benchmark", "Clustering and selector benchmark", "sr215-historical-benchmark", "native-ensemble-rpf.csv", "selected-members.tsv.gz", 60, 12104),
    ("seeds", "Three-seed selector comparison", "sr215-native-seed-comparison", "native-rpf-seed-comparison.csv", None, 72, 12104),
    ("no-afcluster", "AFCluster exclusion", "sr215-no-afcluster", "native-rpf-comparison.csv", "panel-members.csv", 72, 11104),
    ("mcmc-repeats", "Eight-repeat MCMC comparison", "sr215-mcmc-variability", "rounds.csv", "membership.tsv.gz", 64, 12104),
    ("coverage", "Coverage selection", "sr215-selector-pilot", "selector-scores.csv", "selector-members.csv", 18, 11104),
    ("blind", "Blind selection", "sr215-blind-selection", "selector-scores.csv", "selector-members.csv", 30, 11104),
    ("quality-diversity", "Quality and diversity selection", "sr215-quality-diversity", "selector-scores.csv", "selector-members.csv", 18, 11104),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")


def table(data, name):
    if name.endswith(".gz"):
        data = gzip.decompress(data)
    return list(csv.DictReader(io.StringIO(data.decode()), delimiter="\t" if ".tsv" in name else ","))


def number(value):
    if value is None or value == "":
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Nonfinite score")
    return result


def export(source, site):
    output = source / "output"
    catalog = json.loads((site / "current/catalog.json").read_text())
    peak_spec = json.loads((source / "config/sr215-current-peak-lists.json").read_text())
    if catalog["peak_list_version"] != PEAKS or peak_spec["input_version"] != PEAKS or catalog["peak_lists"] != peak_spec["spectra"]:
        raise ValueError("Current input designation differs from scored catalog")
    models = {m["id"]: m for m in json.loads((site / catalog["independent_models"]["path"]).read_text())}
    ensembles = {m["id"]: m for m in json.loads((site / catalog["ensemble_panels"]["path"]).read_text())}
    rows, studies, members_by_study, benchmark_members = [], [], {}, {}
    for key, title, folder, score_file, member_file, expected, cohort in STUDIES:
        base = output / folder
        audit_bytes = (base / "completion-audit.json").read_bytes()
        audit = json.loads(audit_bytes)
        if audit["status"] != "validated":
            raise ValueError("Unaccepted study: " + key)
        version = audit.get("input_version", audit.get("peak_list_variant", audit.get("peak_lists")))
        if key == "seeds":
            plan = json.loads((source / "local/sr215-native-seeds_001/seed-plan.json").read_text())
            if plan["snapshot_sha256"] != audit["snapshot_sha256"] or audit["parent_audit_job"] != 24390 or audit["reused_original_rows"] != 24:
                raise ValueError("Unbound seed follow-up import")
            version = next(s["peak_list_version"] for s in studies if s["id"] == "benchmark")
        if key == "mcmc-repeats":
            plan = json.loads((source / "local/sr215-mcmc-repeat_001/repeat-plan.json").read_text())
            if plan["snapshot_sha256"] != audit["snapshot_sha256"] or audit["existing_replay_matches"] != 24:
                raise ValueError("Unbound MCMC repeat import")
            # This frozen successor inherits the current state's experimental
            # settings. Require all 24 imported baseline queries and scores below.
            version = catalog["peak_list_version"]
        if version != PEAKS:
            raise ValueError("Historical input in current study: " + key)
        hashes = audit["files_sha256"]
        # Validate every table covered by the collected acceptance record.
        for name, expected_sha in hashes.items():
            if sha((base / name).read_bytes()) != expected_sha:
                raise ValueError("Accepted file changed: " + folder + "/" + name)
        if key == "mcmc-repeats":
            for model in table((base / "model-index.csv").read_bytes(), "model-index.csv"):
                if model["prepared_sha256"] != models[model["model_id"]]["structure"]["sha256"]:
                    raise ValueError("MCMC prepared model identity differs")
        records = table((base / score_file).read_bytes(), score_file)
        if key == "benchmark":
            benchmark_members = {r["id"]:r for r in table((base / "member-performance.csv").read_bytes(), "member-performance.csv")}
        if len(records) != expected:
            raise ValueError("Study count changed: " + key)
        membership = defaultdict(list)
        if member_file:
            for member in table((base / member_file).read_bytes(), member_file):
                mid = member.get("model_id", member.get("model"))
                if mid not in models:
                    raise ValueError("Member absent from scored cohort: " + mid)
                if member.get("prepared_sha256") and member["prepared_sha256"] != models[mid]["structure"]["sha256"]:
                    raise ValueError("Prepared member identity changed: " + mid)
                position = member.get("panel_index", member.get("position", member.get("index")))
                membership[member["panel"]].append((int(position), mid))
        if key == "seeds":
            membership = members_by_study["benchmark"]
        members_by_study[key] = membership
        files = {score_file: hashes[score_file]}
        if member_file:
            files[member_file] = hashes[member_file]
        study = dict(id=key, title=title, cohort_models=cohort, rows=expected,
                     snapshot_sha256=audit["snapshot_sha256"], audit_sha256=sha(audit_bytes), source_files=files,
                     score_context="native_ensemble", peak_list_version=PEAKS)
        studies.append(study)
        if key in ("seeds", "mcmc-repeats"):
            study["parent_study"] = "benchmark" if key == "seeds" else "states"
        for record in records:
            native_id = record.get("panel", record.get("id", record.get("native_panel")))
            member_entries = sorted(membership.get(native_id, []))
            if member_entries and ([p for p, _ in member_entries] != list(range(1, 51)) or len({m for _, m in member_entries}) != 50):
                raise ValueError("Invalid ordered panel membership: " + native_id)
            if not member_entries:
                raise ValueError("Missing accepted membership: " + key + "/" + native_id)
            current = ensembles.get(native_id)
            query_sha = record.get("ensemble_sha256")
            viewer_id = native_id if current and query_sha == current["structure"]["sha256"] else None
            method = record.get("selection", record.get("method", "mcmc50"))
            source_partition = record.get("partition")
            partition = {"density":"hdbscan"}.get(source_partition, source_partition) or ("hdbscan" if key in ("states", "mcmc-repeats") else "selection-specific")
            state = record.get("state", "S1")
            rule = record.get("rule") or ("TM80" if state != "all" else "whole")
            prefix = "ensemble_" if "ensemble_RPF_DP" in record else ""
            scores = {metric.lower(): number(record[prefix + "RPF_" + metric]) for metric in ("DP", "Recall", "Precision")}
            if not all(value is not None and 0 <= value <= 1 for value in scores.values()):
                raise ValueError("Invalid native score")
            if key == "mcmc-repeats" and record["source"] == "previous":
                if not viewer_id or any(scores[k] != current[k] for k in scores) or [mid for _,mid in member_entries] != current["members"]:
                    raise ValueError("MCMC parent scores, queries or membership differ")
            if key == "seeds":
                previous = next((r for r in rows if r["study"] == "benchmark" and r["source_id"] == native_id), None)
                if previous and (any(previous[k] != scores[k] for k in scores) or previous["ensemble_sha256"] != query_sha):
                    raise ValueError("Seed follow-up parent differs")
            member_metrics = {}
            keys = {"dp":"RPF_DP", "recall":"RPF_Recall", "precision":"RPF_Precision",
                    "molprobity":"molprobity_score", "clashscore":"clashscore", "energy_t10":"energy_t10"}
            for public_key, source_key in keys.items():
                value = next((record[name] for name in (source_key+"_mean", "member_"+source_key, "mean_member_"+source_key, "member_mean_"+source_key) if name in record), None)
                if value is None and key in ("benchmark", "seeds"):
                    value = benchmark_members[native_id][source_key]
                member_metrics[public_key] = number(value)
            rows.append(dict(id=key + ":" + native_id, source_id=native_id, study=key, cohort_models=cohort,
                             range=record.get("residue_range", record.get("range")), partition=partition, source_partition=source_partition, state=state,
                             rule=rule, method=method, seed=record.get("seed") or "fixed", repeat=record.get("repeat"),
                             score_context="native_ensemble", models=50, **scores,
                             members=[mid for _, mid in member_entries], member_metrics=member_metrics,
                             ensemble_sha256=query_sha, viewer_id=viewer_id))
    # The larger recovered screen contains member means and visit-weighted means,
    # which must never be plotted as native ensemble scores.
    base = output / "sr215-historical-benchmark"
    audit = json.loads((base / "completion-audit.json").read_text())
    name = "member-performance.csv"
    screen = table((base / name).read_bytes(), name)
    studies.append(dict(id="member-screen", title="Model-selection and occupancy screen", cohort_models=12104,
                        rows=len(screen), snapshot_sha256=audit["snapshot_sha256"],
                        audit_sha256=sha((base / "completion-audit.json").read_bytes()),
                        source_files={name:audit["files_sha256"][name]}, score_context="member_summaries", peak_list_version=PEAKS))
    for record in screen:
        context = "visit_weighted_member" if record["kind"] == "visits" else "mean_independent_member"
        rows.append(dict(id="member-screen:"+record["id"], source_id=record["id"], study="member-screen", cohort_models=12104,
                         range=record["range"], partition={"density":"hdbscan"}.get(record["partition"],record["partition"]), source_partition=record["partition"], rule=record["rule"], state=record["state"],
                         method=record["method"], seed=record["seed"], repeat=record["repeat"], score_context=context,
                         models=int(record["unique_models"]), draws=int(record["draws"]),
                         alpha=number(record["alpha"]), tau_multiplier=number(record["tau_multiplier"]),
                         **{m.lower():number(record["RPF_"+m]) for m in ("DP","Recall","Precision")},
                         molprobity=number(record["molprobity_score"]), energy_t10=number(record["energy_t10"]),
                         members=[], viewer_id=None))
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Duplicate study row identities")
    payload = dict(schema_version=1, target=catalog["target"], peak_list_version=PEAKS,
                   control_variant=catalog["rpf_control_variant"], release_date="2026-11-09", studies=studies, rows=rows,
                   qualifications=["Study rows include reused panels and are not independent experiments.",
                                   "Native ensemble, mean member, and visit-weighted member scores are distinct contexts.",
                                   "RPF evaluates the full 139-residue construct; residue masks define clustering and state selection.",
                                   "State labels are local to each cohort and residue mask.",
                                   "Top-DP selection is a positive control selected using the same RPF data.",
                                   "Native ensemble scores use ASDP midrange inter-proton distances and printed precision."])
    path = site / "current/comparisons.json"
    write(path, payload)
    catalog["configuration_comparisons"] = dict(path="current/comparisons.json",sha256=sha(path.read_bytes()),
                                               study_count=len(studies),native_ensemble_rows=382,member_summary_rows=len(screen),
                                               includes_reused_panels=True)
    write(site / "current/catalog.json", catalog)
    reports = ["SR215_historical_sampling_benchmark_multiseed.pdf", "SR215_no_AFCluster_clustering_and_sampling.pdf"]
    for name in reports:
        (site / "current" / name).write_bytes((output / "pdf" / name).read_bytes())
    print(json.dumps(dict(studies=len(studies),native_rows=382,member_rows=len(screen),total_rows=len(rows))))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    export(args.source_root, args.site)
