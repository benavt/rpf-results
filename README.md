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
native comparisons link all 50 saved members to their independent structures. All 382 native comparison rows can also assemble
and display their verified selected members as an aligned multi-model PDB.

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

## Structure presentation

The ensemble residue selector has a prominent **Open structure atlas** link
that follows the active range, including direct links to saved ensemble results.
It opens the matching `current-12104` atlas view in a new tab and keeps the RPF
results available. All three atlas ranges also remain linked below the browser.

Continuous colors use the standard Matplotlib **Spectral** 256-color map, low
values red and high values purple, including residue diagnostics and sequence
position. Missing assignments remain gray. Stored diagnostic values are unchanged;
the viewers replace their saved display colors with Spectral. The archive viewer
uses its explicitly saved 32–47 plus 78–99 clustering scope; its original scored
payloads, historical scripts and release manifest remain byte-identical.

Every current ensemble is rigidly fitted to its first saved member using chain A
Cα atoms in that panel's clustering/state residue selection: 1–139, 5–95, or
32–47 plus 78–99. Full structures remain visible, and the selected residues and
reference model are labeled. Missing or ambiguous fit atoms stop display rather
than substituting another selection. This is a display transform with no
relaxation, reflection, scaling, outlier removal or change in scores.

**Download aligned ensemble PDB** exports every displayed model in saved order
with standard MODEL/ENDMDL blocks and source model IDs. Coordinates are rounded
to PDB's three decimals after fitting; original scored coordinates remain available
separately for the 48 exact scored state panels. Comparison ensembles are rebuilt
from hash-verified prepared members; their aligned PDBs are presentation artifacts,
not replacements for the scored original's SHA-256. Per-model colors there are
explicitly independent single-model scores; native ensemble scores stay separate.

```sh
node tests/test_ensemble_presentation.cjs
```
