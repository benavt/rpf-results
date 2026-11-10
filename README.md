# SR215 RPF results

The default release uses the designated `SR215-TR-2026-11-06-v1` peak lists and
`tr-original-control`. `legacy.html` preserves the historical ensembles and all
their original payloads and permalinks.

- `index.html`: 12,104 independent scored structures and 48 exact native-scored
  state ensembles, with the existing structure and residue-color controls.
- `comparisons.html`: nine accepted studies, including 382 native ensemble
  study rows and 1,824 separately labeled member/occupancy summaries.
- `current/catalog.json`: input identities, coordinate hashes and index hashes.
- `current/comparisons.json`: public score schema, ordered memberships,
  accepted source-table hashes, study snapshots and material qualifications.

Study rows include repeated panels across studies. Cohorts, masks, state rules,
clustering priors, selectors and seeds remain explicit. Native ensemble scores,
mean member scores and visit-weighted summaries must not be pooled as one metric.
All 12,104 independent models include residue diagnostics from their own saved
native QP report, bound to the scored PDB hash. The single-model viewer starts
with the legacy RPF heat index and also offers violation counts, short
violations, and shortest unsupported distance. These are residue precision
diagnostics; no residue-wise Recall, Precision fraction, or DP is inferred.
Unassigned residues remain gray. Only the original 48 state ensembles have full
scored ensemble coordinates and ensemble residue diagnostics bundled here; other
native comparisons link all 50 saved members to their independent structures.

Rebuild comparison data from an existing RPF evidence collection:

```sh
python3 scripts/build_comparisons.py --source-root /path/to/RPF
python3 -m unittest discover -s tests -v
node --check comparisons.js
node tests/test_structure_colors.cjs
node tests/test_diagnostic_loader.cjs
python3 scripts/freeze_release.py
python3 scripts/freeze_release.py --verify
```

The exporter verifies accepted source-table hashes, exact prepared-member
identities and ordered panel membership. It does not prepare coordinates,
sample, cluster or run scientific scoring. Export schemas exclude private
native-output locations. Historical payloads and scored coordinate packs remain
byte-identical. Freeze the manifest only after reviewing the export and UI.

The `scripts/build_model_diagnostics.py` exporter reads hash-verified accepted
archives using the existing RPF parser and native archive readers. Supply its
private frozen source plan with `--plan`, the pinned parser source bundle with
`--rpf-source`, and a fresh `--output` directory. It exports compact diagnostic
packs without preparing coordinates or running scientific scoring.
