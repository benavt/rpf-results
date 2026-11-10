"""Verify complete independent-model coverage and scored-coordinate identity."""
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ModelDiagnosticsChecks(unittest.TestCase):
    def test_all_published_models_have_matching_residue_diagnostics(self):
        catalog = json.loads((ROOT / "current/catalog.json").read_text())
        record = catalog["independent_models"]["residue_diagnostics"]
        raw = (ROOT / record["path"]).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), record["sha256"])
        index = json.loads(raw)
        self.assertEqual(index["score_context"], "independent_single_model")
        self.assertEqual(index["input_version"], catalog["peak_list_version"])
        self.assertEqual(index["control_variant"], catalog["rpf_control_variant"])
        self.assertEqual(index["scientific_calls"], 0)
        self.assertEqual(index["model_index_sha256"], catalog["independent_models"]["sha256"])
        self.assertEqual(len(index["residues"]), 139)
        self.assertEqual([layer["id"] for layer in index["layers"]], ["legacy_rpf_heat", "precision_violation_groups", "short_precision_violation_groups", "shortest_unsupported_distance"])
        self.assertTrue(all(layer["scope"] == "model" for layer in index["layers"]))
        models = {m["id"]: m for m in json.loads((ROOT / "current/models.json").read_text())}
        seen = set()
        public_text = [raw.decode()]
        for coordinate_pack, pin in index["coordinate_packs"].items():
            packed = (ROOT / pin["path"]).read_bytes()
            self.assertEqual(len(packed), pin["bytes"])
            self.assertEqual(hashlib.sha256(packed).hexdigest(), pin["sha256"])
            text = gzip.decompress(packed).decode()
            public_text.append(text)
            data = json.loads(text)
            self.assertEqual(data["score_context"], "independent_single_model")
            self.assertEqual(len(data["models"]), pin["models"])
            for mid, row in data["models"].items():
                self.assertNotIn(mid, seen)
                seen.add(mid)
                self.assertEqual(models[mid]["structure"]["path"], coordinate_pack)
                self.assertEqual(row["query_sha256"], models[mid]["structure"]["sha256"])
                for name in ("native_qp_sha256", "result_sha256", "native_archive_sha256"):
                    self.assertRegex(row[name], r"^[a-f0-9]{64}$")
                self.assertEqual(len(row["values"]), 4)
                self.assertEqual(len(row["heat_colors"]), 139)
                for values in row["values"]:
                    self.assertEqual(len(values), 139)
                    self.assertTrue(all(v is None or isinstance(v, (int, float)) and math.isfinite(v) for v in values))
                for i, residue in enumerate(index["residues"]):
                    if residue["assigned_proton_sites"] == 0:
                        self.assertTrue(all(values[i] is None for values in row["values"]))
                        self.assertEqual(row["heat_colors"][i], "#aeb4be")
                    self.assertRegex(row["heat_colors"][i], r"^#[0-9a-f]{6}$")
        self.assertEqual(seen, models.keys())
        self.assertEqual(len(seen), index["models"])
        self.assertEqual(len(seen), record["count"])
        self.assertIn("SR215_bmr6366__AFSample3__0758", seen)
        self.assertIn("SR215_bmr6366__AFSample3__0415", seen)
        self.assertIsNone(re.search(r"/home/|/scratch/|/Users/|\.ts\.net", "".join(public_text)))


if __name__ == "__main__":
    unittest.main()
