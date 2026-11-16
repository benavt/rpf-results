"""Portable checks for the accepted, fixed SR215 two-method cohort.

Pins come from the independently reviewed saved results; these tests perform no
sampling, structural calculations, native scoring, or network requests.
"""

import collections
import hashlib
import json
import math
from pathlib import Path
import statistics
import unittest


ROOT = Path(__file__).resolve().parents[1]
MASKS = {
    "all": (1928, {"afsample3": 1000, "bioemu2": 928}, "15–72", 20, 926),
    "res5-95": (1951, {"afsample3": 1000, "bioemu2": 951}, "15–72", 21, 882),
    "res32-47-plus78-99": (955, {"afsample3": 955, "bioemu2": 0}, "32–47", 26, 1022),
    "res32-47-plus78-99-plus121-139": (
        583, {"afsample3": 583, "bioemu2": 0}, "32–47", 24, 1076
    ),
}
SOURCE_HASHES = {
    "summary.json.gz": "363c7be00fbc42390b821e407294b0c35b98c2ac014bae8400d1e959e6fdda84",
    "model-scores-2000.json.gz": "f89b354a11713691f4fc39452fc614fe28bf59d961499375995a92544a4c8de4",
    "panel-scores.csv": "70c963d6982cc375c909fef64582db9c9d411628b78c52e67b89e7d1494b8040",
    "double-recall.json.gz": "8f797a01ba73136f1b0fcca91662c02be7bc9b1fc449c89127d40190a97e2151",
    "representative-tm.json.gz": "319795e13f6f806ae348e7c98cc96cc806a5de5eb92ff887503da90e56220fff",
}
SUMMARY_HASH = "e2a19583142d198fa31ab0a1dd46c8bbbaf6a094b9fcdd1578cf9e13b5642ab5"
PREPARED_IDENTITY_HASH = "08dc6e8b9b36c5f9f0cb36ed30b0bd875d320cb2e79dce47c623847ff36f4328"
SCORE_ROSTER_HASH = "42bca106413067bcd7601b41a9e97b8b0ff6f1655db50ac341b9bda4f2475b37"
# Original b3fe478 report: sorted (mask, state, method, ordered model IDs).
HISTORICAL_PANEL_ROSTER_HASH = "7042c792e5efeaebef05fd79574e445aafd8d3c2d779c072432343f1ce42aa7f"
PANEL_SCORES = {
    ("all", "mcmc50"): (.72, .90, .95),
    ("all", "disco50"): (.75, .92, .95),
    ("res5-95", "mcmc50"): (.74, .91, .95),
    ("res5-95", "disco50"): (.74, .91, .95),
    ("res32-47-plus78-99", "mcmc50"): (.78, .94, .93),
    ("res32-47-plus78-99", "disco50"): (.77, .94, .94),
    ("res32-47-plus78-99-plus121-139", "mcmc50"): (.77, .94, .93),
    ("res32-47-plus78-99-plus121-139", "disco50"): (.78, .94, .94),
}


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def digest(value):
    raw = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class Cohort2000Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = read_json("current/cohort-2000/report.json")
        cls.summary = cls.report["accepted_summary"]
        cls.rows = cls.report["model_rows"]
        cls.by_id = {row["id"]: row for row in cls.rows}
        cls.current = {row["id"]: row for row in read_json("current/models.json")}

    def test_accepted_snapshot_and_source_pins(self):
        for name, expected in SOURCE_HASHES.items():
            with self.subTest(source=name):
                self.assertEqual(self.report["accepted_sources"][name], expected)
        self.assertEqual(digest(self.summary), SUMMARY_HASH)
        catalog = read_json("current/catalog.json")
        self.assertEqual(self.report["peak_list_version"], catalog["peak_list_version"])
        self.assertEqual(self.report["control_variant"], catalog["rpf_control_variant"])

    def test_exact_model_roster_scores_and_prepared_coordinate_identities(self):
        self.assertEqual(self.report["models"], 2000)
        self.assertEqual(len(self.rows), 2000)
        self.assertEqual(len(self.by_id), 2000)
        self.assertEqual(
            collections.Counter(row["method"] for row in self.rows),
            {"afsample3": 1000, "bioemu2": 1000},
        )
        identities, scores = [], []
        for row in sorted(self.rows, key=lambda item: item["id"]):
            with self.subTest(model=row["id"]):
                self.assertRegex(
                    row["id"], r"^SR215_bmr6366__(?:AFSample3|BioEMU2)__\d{4}$"
                )
                self.assertLess(int(row["id"].rsplit("__", 1)[1]), 1000)
                current = self.current[row["id"]]
                self.assertEqual(row["method"], current["method"])
                for key in ("dp", "recall", "precision", "source_sha256"):
                    self.assertEqual(row[key], current[key], key)
                for key in ("dp", "recall", "precision"):
                    self.assertTrue(math.isfinite(row[key]))
                identities.append([
                    row["id"], row["source_sha256"], current["structure"]["sha256"]
                ])
                scores.append([row["id"], row["dp"], row["recall"], row["precision"]])
        # The current coordinate index must retain all accepted prepared queries,
        # regardless of its historical display label "original_coordinates".
        self.assertEqual(digest(identities), PREPARED_IDENTITY_HASH)
        self.assertEqual(digest(scores), SCORE_ROSTER_HASH)

    def test_method_summaries_use_individual_model_scores(self):
        for method in ("afsample3", "bioemu2"):
            with self.subTest(method=method):
                rows = [row for row in self.rows if row["method"] == method]
                for metric in ("dp", "recall", "precision"):
                    values = [row[metric] for row in rows]
                    actual = self.report["method_stats"][method][metric]
                    self.assertEqual(actual["median"], statistics.median(values))
                    q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
                    self.assertAlmostEqual(actual["q1"], q1, places=14)
                    self.assertAlmostEqual(actual["q3"], q3, places=14)

    def test_four_native_states_and_method_compositions(self):
        masks = self.summary["masks"]
        self.assertEqual([mask["id"] for mask in masks], list(MASKS))
        for mask in masks:
            with self.subTest(mask=mask["id"]):
                count, composition, core, clusters, noise = MASKS[mask["id"]]
                self.assertEqual(len(mask["states"]), 1)
                state = mask["states"][0]
                self.assertEqual((state["id"], state["count"]), ("S1", count))
                self.assertEqual(state["tm_positions_label"], core)
                self.assertIn(state["anchor"], self.by_id)
                self.assertEqual(self.report["state_compositions"][mask["id"]], composition)
                self.assertEqual(sum(composition.values()), count)
                self.assertEqual(mask["density_clusters"], clusters)
                self.assertEqual(mask["density_unassigned"], noise)

    def test_eight_exact_native_panels_are_not_member_median_scores(self):
        panels = self.summary["panels"]
        self.assertEqual(len(panels), 8)
        self.assertEqual(len({panel["id"] for panel in panels}), 8)
        self.assertEqual(
            {(panel["mask"], panel["method"]) for panel in panels}, set(PANEL_SCORES)
        )
        for panel in panels:
            with self.subTest(panel=panel["id"]):
                self.assertIs(panel["accepted"], True)
                self.assertEqual((panel["state"], panel["repeat"]), ("S1", 1))
                self.assertEqual(len(panel["models"]), 50)
                self.assertEqual(len(set(panel["models"])), 50)
                self.assertTrue(set(panel["models"]) <= self.by_id.keys())
                self.assertEqual(
                    tuple(panel[key] for key in ("dp", "recall", "precision")),
                    PANEL_SCORES[(panel["mask"], panel["method"])],
                )
                median = statistics.median(self.by_id[mid]["dp"] for mid in panel["models"])
                self.assertNotAlmostEqual(panel["dp"], median, places=6)
                self.assertRegex(panel["pdb_sha256"], r"^[a-f0-9]{64}$")
                if panel["mask"].startswith("res32-47"):
                    self.assertTrue(all(self.by_id[mid]["method"] == "afsample3"
                                        for mid in panel["models"]))
        # Compare to the original committed selections, independently of the
        # current report's presentation schema or duplicated range metadata.
        historical_masks = {"all", "res5-95", "res32-47-plus78-99"}
        historical = sorted([
            [panel["mask"], panel["state"], panel["method"], panel["models"]]
            for panel in panels if panel["mask"] in historical_masks
        ], key=lambda row: row[:3])
        self.assertEqual(len(historical), 6)
        self.assertEqual(digest(historical), HISTORICAL_PANEL_ROSTER_HASH)

    def test_double_recall_preserves_directional_record_and_pair_counts(self):
        rows = self.summary["double_recall"]
        self.assertEqual(len(rows), 31)
        self.assertEqual(len({row["id"] for row in rows}), 31)
        self.assertEqual(collections.Counter(row["kind"] for row in rows), {
            "panel-medoid": 24, "selector-pair": 4, "medoid-pair": 3,
        })
        for row in rows:
            with self.subTest(comparison=row["id"]):
                for key in ("a_explained_by_b", "b_explained_by_a", "a_h_h_pairs",
                            "b_h_h_pairs", "a_long_range_pairs", "b_long_range_pairs"):
                    self.assertIs(type(row[key]), int)
                    self.assertGreaterEqual(row[key], 0)
                if row["kind"] != "medoid-pair":
                    self.assertIn(row["mask"], MASKS)
                    self.assertEqual(row["repeat"], 1)

    def test_report_coverage_counts_the_completed_cohort(self):
        self.assertEqual(self.report["coverage"], {
            "independent_models": 2000, "residue_subsets": 4, "native_panels": 8,
            "double_recall_comparisons": 31, "representative_entries": 99,
            "medoid_tm_comparisons": 6000,
        })
        self.assertEqual(self.summary["cohort_id"], "afsample3-bioemu2")
        self.assertEqual(self.summary["cohort_models"], 2000)
        self.assertEqual(self.summary["repeats"], 1)


if __name__ == "__main__":
    unittest.main()
