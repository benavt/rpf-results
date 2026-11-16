"""Build the public v3 independent model release from the accepted Mimas handoff."""
import argparse
import csv
import hashlib
import json
import math
import re
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'SR215-TR-2026-11-13-v3'
COUNT = 12104
METRICS = {'dp': 'DP', 'recall': 'Recall', 'precision': 'Precision'}
CSV_NAME = 'SR215_AIS_model_scores_12104.csv'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def write(path, body):
    path.write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')


def by_id(rows, key, expected):
    index = {row[key]: row for row in rows}
    if len(rows) != expected or len(index) != expected:
        raise ValueError('Incomplete or duplicate model roster')
    return index


def csv_rows(path):
    with path.open(newline='') as stream:
        return list(csv.DictReader(stream))


def build(handoff, input_spec, pdf=None, root=ROOT):
    acceptance = read(handoff / 'ui-refresh-manifest.json')
    proof = read(handoff / 'collection-proof.json')
    audit = proof['source_audit']
    archived = read(root / 'current/catalog.json')
    if (acceptance['input_version'] != VERSION or acceptance['cohort_count'] != COUNT
            or acceptance['snapshot_sha256'] != proof['snapshot'] or audit['input_version'] != VERSION
            or audit['scored'] != COUNT or audit['failed'] or not audit['all_archives_hash_checked_and_scores_reparsed']):
        raise ValueError('The v3 handoff must be complete and accepted')
    for name in (CSV_NAME, 'rpf-model-metrics.json'):
        if sha(handoff / name) != acceptance['files_sha256'][name]:
            raise ValueError('Accepted handoff file hash changed')
    if sha(input_spec) != acceptance['input_manifest_sha256']:
        raise ValueError('Input manifest differs from the admitted run')
    spec = read(input_spec)
    if spec['input_version'] != VERSION or spec['target'] != archived['target']:
        raise ValueError('Input version or target mismatch')
    prior = by_id(read(root / archived['independent_models']['path']), 'id', COUNT)
    old_csv = by_id(csv_rows(root / archived['independent_models']['csv_path']), 'model_id', COUNT)
    score_csv = by_id(csv_rows(handoff / CSV_NAME), 'model_id', COUNT)
    scores = by_id(read(handoff / 'rpf-model-metrics.json'), 'model_id', COUNT)
    if not (prior.keys() == old_csv.keys() == score_csv.keys() == scores.keys()):
        raise ValueError('Model rosters differ across artifacts')
    joined = []
    for mid, model in prior.items():
        new, row, old = scores[mid], score_csv[mid], old_csv[mid]
        if not (mid == new['id'] and model['method'] == new['method'] == row['method']
                and model['source_sha256'] == new['source_sha256'] == row['source_sha256']
                and model['structure']['sha256'] == new['query_sha256'] == row['query_sha256']
                and new['input_version'] == row['input_version'] == VERSION and row['status'] == 'scored'):
            raise ValueError(f'Score identity mismatch for {mid}')
        if any(row[k] != value for k, value in old.items() if k not in {'RPF_DP','RPF_Recall','RPF_Precision'}):
            raise ValueError(f'Non-RPF annotation changed for {mid}')
        metrics = {k: new[label] for k, label in METRICS.items()}
        if (not all(math.isfinite(v) and v == float(row['RPF_'+METRICS[k]]) for k,v in metrics.items())
                or not all(0 <= metrics[k] <= 1 for k in ('recall', 'precision'))):
            raise ValueError(f'Invalid or inconsistent scores for {mid}')
        joined.append({**model, **metrics})

    output = root / 'current/v3'
    output.mkdir(exist_ok=True)
    for name in (CSV_NAME,):
        raw = (handoff / name).read_bytes()
        if re.search(rb'/scratch/|/home/|/Users/|\.codex/attachments|Traceback', raw):
            raise ValueError('Private metadata is not part of the public CSV')
        (output / name).write_bytes(raw)
    write(output / 'models.json', joined)
    focused_prior = read(root / 'current/cohort-2000/report.json')['model_rows']
    focus = by_id(focused_prior, 'id', 2000)
    focused = []
    for mid, old in focus.items():
        row = score_csv[mid]
        if row['method'] != old['method'] or row['method'] not in ('afsample3', 'bioemu2'):
            raise ValueError('Focused cohort membership changed')
        focused.append(row)
    if Counter(row['method'] for row in focused) != {'afsample3': 1000, 'bioemu2': 1000}:
        raise ValueError('Unexpected focused cohort counts')
    with (output/'cohort-2000-models.csv').open('w', newline='') as stream:
        out = csv.DictWriter(stream, fieldnames=list(focused[0])); out.writeheader(); out.writerows(focused)

    summary = {}
    for method in sorted({row['method'] for row in score_csv.values()}):
        group = [row for row in score_csv.values() if row['method'] == method]
        summary[method] = {'count': len(group), **{k: statistics.median(float(r[k]) for r in group) for k in
                           ('RPF_DP','RPF_Recall','RPF_Precision','molprobity_score','clashscore','energy_t10')}}
    write(output / 'method-summary.json', summary)
    diagnostics = archived['independent_models']['residue_diagnostics']
    release = dict(schema_version=1, target=archived['target'], release_date='2026-11-16',
                   peak_list_version=VERSION, rpf_control_variant='user-v3-exact',
                   peak_lists=spec['spectra'], inputs=spec['files'],
                   snapshot_sha256=acceptance['snapshot_sha256'],
                   input_manifest_sha256=acceptance['input_manifest_sha256'],
                   completion_audit_sha256=acceptance['native_audit_sha256'],
                   independent_models=dict(path='current/v3/models.json', sha256=sha(output/'models.json'), count=COUNT,
                       score_context='independent_single_model', csv_path='current/v3/'+CSV_NAME, csv_sha256=sha(output/CSV_NAME)),
                   score_domains={k:[min(r[k] for r in joined),max(r[k] for r in joined)] for k in METRICS},
                   focus_csv_sha256=sha(output/'cohort-2000-models.csv'),
                   method_summary_sha256=sha(output/'method-summary.json'),
                   archived_v1=dict(catalog='current/catalog.json', input_version=archived['peak_list_version'],
                       residue_diagnostics=diagnostics['path'], ensemble_scores=archived['ensemble_panels']['path'],
                       comparisons=archived['configuration_comparisons']['path']))
    if pdf:
        name = 'SR215_AIS_score_comparison_12104_v3.pdf'
        (output / name).write_bytes(pdf.read_bytes())
        release['score_report'] = {'path': 'current/v3/'+name, 'sha256': sha(output / name)}
    write(output / 'catalog.json', release)
    return release


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--handoff', type=Path, required=True)
    parser.add_argument('--input-spec', type=Path, required=True)
    parser.add_argument('--pdf', type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.handoff, args.input_spec, args.pdf), indent=2))
