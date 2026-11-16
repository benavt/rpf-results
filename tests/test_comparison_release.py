"""Integration checks for scientific identity and public release boundaries."""
import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReleaseChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "current/catalog.json").read_text())
        cls.data = json.loads((ROOT / "current/comparisons.json").read_text())
        cls.models = {r["id"]: r for r in json.loads((ROOT / "current/models.json").read_text())}
        cls.ensembles = {r["id"]: r for r in json.loads((ROOT / "current/ensembles.json").read_text())}

    def test_version_and_payload_identity(self):
        record = self.catalog["configuration_comparisons"]
        self.assertEqual(hashlib.sha256((ROOT / record["path"]).read_bytes()).hexdigest(), record["sha256"])
        self.assertEqual(self.data["peak_list_version"], self.catalog["peak_list_version"])
        self.assertEqual(self.data["control_variant"], "tr-original-control")
        self.assertEqual(len(self.models), 12104)

    def test_native_member_links_and_viewer_scores(self):
        for row in self.data["rows"]:
            if row["score_context"] != "native_ensemble":
                self.assertIsNone(row["viewer_id"])
                continue
            self.assertEqual(len(set(row["members"])), 50)
            self.assertTrue(all(mid in self.models for mid in row["members"]))
            if row["cohort_models"] == 11104:
                self.assertFalse(any(self.models[mid]["method"] == "afcluster" for mid in row["members"]))
            if row["viewer_id"]:
                ensemble = self.ensembles[row["viewer_id"]]
                self.assertEqual(row["members"], ensemble["members"])
                self.assertEqual(row["ensemble_sha256"], ensemble["structure"]["sha256"])
                for metric in ("dp", "recall", "precision"):
                    self.assertEqual(row[metric], ensemble[metric])

    def test_study_inventory_and_metric_contexts(self):
        rows = self.data["rows"]
        self.assertEqual(len({r["id"] for r in rows}), len(rows))
        for study in self.data["studies"]:
            selected = [r for r in rows if r["study"] == study["id"]]
            self.assertEqual(len(selected), study["rows"])
            self.assertTrue(all(r["cohort_models"] == study["cohort_models"] for r in selected))
        self.assertEqual(sum(r["score_context"] == "native_ensemble" for r in rows), 382)
        self.assertEqual(sum(r["score_context"] == "mean_independent_member" for r in rows), 1284)
        self.assertEqual(sum(r["score_context"] == "visit_weighted_member" for r in rows), 540)
        self.assertEqual({r["models"] for r in rows if r["score_context"] == "native_ensemble"}, {50})
        self.assertTrue(any(r["models"] != 50 for r in rows if r["method"] == "disco_min_per_cluster"))

    def test_public_schema_excludes_private_locators(self):
        raw = (ROOT / "current/comparisons.json").read_text()
        self.assertIsNone(re.search(r"/home/|/scratch/|/Users/|/farm/|/data/montelione/|\.ts\.net|BEGIN .*PRIVATE KEY", raw))
        for row in self.data["rows"]:
            self.assertNotIn("native_result", row)
            self.assertNotIn("native_panel", row)

    def test_historical_manifest_still_matches(self):
        manifest = json.loads((ROOT / "legacy-publication-manifest.json").read_text())
        for name, entry in manifest["files"].items():
            if name == "index.html":
                continue
            raw = (ROOT / name).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), entry["sha256"], name)


if __name__ == "__main__":
    unittest.main()
