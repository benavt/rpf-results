"""Refresh or verify the complete static release manifest, without rescoring."""
import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return dict(bytes=path.stat().st_size, sha256=hasher.hexdigest())


def inventory():
    files = {}
    for folder, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "__pycache__")]
        for name in names:
            path = Path(folder) / name
            relative = path.relative_to(ROOT).as_posix()
            if relative != "publication-manifest.json" and not name.endswith(".pyc"):
                files[relative] = digest(path)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    path = ROOT / "publication-manifest.json"
    manifest = json.loads(path.read_text())
    files = inventory()
    total = sum(record["bytes"] for record in files.values())
    if total >= 1024 ** 3:
        raise ValueError("Static release exceeds the 1 GiB site budget")
    if args.verify:
        if manifest["files"] != files or manifest["total_bytes_before_manifest"] != total:
            raise ValueError("Release manifest differs from current files")
    else:
        manifest["files"] = files
        manifest["total_bytes_before_manifest"] = total
        manifest["model_score_cohort"]["catalog"]["sha256"] = files["current/catalog.json"]["sha256"]
        manifest["legacy_count_scope"] = "runs, run_ids, model_collections and model_evaluations describe the archived release"
        catalog = json.loads((ROOT / "current/catalog.json").read_text())
        manifest["current_release"] = dict(date="2026-11-09", input_version=catalog["peak_list_version"],
                                           independent_models=catalog["independent_models"]["count"],
                                           exact_state_ensembles=catalog["ensemble_panels"]["count"],
                                           comparisons=catalog["configuration_comparisons"])
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(json.dumps(dict(status="verified" if args.verify else "frozen", files=len(files), bytes=total)))


if __name__ == "__main__":
    main()
