import csv
import hashlib
import json
import math
import statistics
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V3 = 'SR215-TR-2026-11-13-v3'


class V3ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old = json.loads((ROOT/'current/catalog.json').read_text())
        cls.new = json.loads((ROOT/'current/v3/catalog.json').read_text())
        cls.models = [json.loads((ROOT/c['independent_models']['path']).read_text()) for c in (cls.old,cls.new)]
        with (ROOT/cls.new['independent_models']['csv_path']).open(newline='') as stream:
            cls.rows = list(csv.DictReader(stream))

    def test_complete_verified_release_and_no_mixed_version_claims(self):
        self.assertEqual(self.new['peak_list_version'], V3)
        self.assertEqual(self.new['archived_v1']['input_version'], self.old['peak_list_version'])
        for record in (self.new['independent_models'],self.new['score_report']):
            self.assertEqual(hashlib.sha256((ROOT/record['path']).read_bytes()).hexdigest(), record['sha256'])
        record = self.new['independent_models']
        self.assertEqual(hashlib.sha256((ROOT/record['csv_path']).read_bytes()).hexdigest(), record['csv_sha256'])
        self.assertNotIn('residue_diagnostics',record)
        self.assertNotIn('ensemble_panels',self.new)
        self.assertEqual(self.new['snapshot_sha256'], 'aef705410140a4338eeaec51ccce0a622c63eecbb47f2e865fe4531d3eddba29')

    def test_same_coordinates_exact_scores_and_all_methods(self):
        prior, current = [{r['id']:r for r in rows} for rows in self.models]
        rows = {r['model_id']:r for r in self.rows}
        self.assertEqual(len(current),12104)
        self.assertEqual(len(self.rows),12104)
        self.assertEqual(prior.keys(),current.keys())
        self.assertEqual(current.keys(),rows.keys())
        for mid, value in current.items():
            self.assertEqual({k:v for k,v in value.items() if k not in ('dp','recall','precision')},
                             {k:v for k,v in prior[mid].items() if k not in ('dp','recall','precision')})
            self.assertEqual(rows[mid]['input_version'],V3)
            self.assertEqual(rows[mid]['query_sha256'],value['structure']['sha256'])
            self.assertEqual(rows[mid]['source_sha256'],value['source_sha256'])
            for name in ('DP','Recall','Precision'):
                self.assertTrue(math.isfinite(value[name.lower()]))
                self.assertEqual(value[name.lower()],float(rows[mid]['RPF_'+name]))
        self.assertEqual(len({r['method'] for r in current.values()}),12)

    def test_focused_exact_subset_and_visible_medians(self):
        with (ROOT/'current/v3/cohort-2000-models.csv').open(newline='') as stream:
            focus = list(csv.DictReader(stream))
        self.assertEqual(Counter(r['method'] for r in focus),{'afsample3':1000,'bioemu2':1000})
        self.assertEqual(len({r['model_id'] for r in focus}),2000)
        self.assertEqual({r['model_id'] for r in focus},
                         {r['model_id'] for r in self.rows if r['method'] in ('afsample3','bioemu2')})
        summary = json.loads((ROOT/'current/v3/method-summary.json').read_text())
        home = (ROOT/'index.html').read_text()
        for method, row in summary.items():
            population = [r for r in self.rows if r['method']==method]
            median = statistics.median(float(r['RPF_DP']) for r in population)
            self.assertEqual(row['RPF_DP'],median)
            self.assertIn(f'{method}</th><td>{len(population):,}</td><td>{median:.3f}</td>',home)
