# SR215 RPF results

The default independent-model release uses `SR215-TR-2026-11-13-v3` and
`user-v3-exact`. All 12,104 scores were accepted in the full-cohort Mimas run
documented in [RPF PR #21](https://github.com/benavt/RPF/pull/21). The scored
coordinate bytes, MolProbity and ProteinEBM annotations were preserved.

- `index.html`: v3 independent scores, sortable model browser, CSV and PDF.
  `?cohort=2000#models` limits the browser to AFSample3 and BioEMU2.
- `?input=v1#models`: archived v1 independent scores and matched residue coloring.
  `#ensembles` retains the 48 exact native v1 ensembles and original deep links.
- `comparisons.html`: nine historical v1 studies, including 382 native ensemble
  rows and 1,824 separately labeled member/occupancy summaries.
- `current/v3/catalog.json`: accepted v3 identities and model, CSV and PDF hashes.
  `current/catalog.json` is the unchanged v1 catalog for existing consumers.
- `current/comparisons.json`: public score schema, ordered memberships,
  accepted source-table hashes, study snapshots and material qualifications.

Study rows include repeated panels across studies. Cohorts, masks, state rules,
clustering priors, selectors and seeds remain explicit. Native ensemble scores,
mean member scores and visit-weighted summaries must not be pooled as one metric.
The archived v1 single-model viewer uses each model's saved native QP report,
bound to its scored PDB hash. No v3 residue diagnostics or native ensemble
scores are claimed in this release. The archived viewer starts
with the legacy RPF heat index and also offers violation counts, short
violations, and shortest unsupported distance. These are residue precision
diagnostics; no residue-wise Recall, Precision fraction, or DP is inferred.
Unassigned residues remain gray. Only the original 48 state ensembles have full
scored ensemble coordinates and ensemble residue diagnostics bundled here; other
native comparisons link all 50 saved members to their independent structures. All 382 native comparison rows can also assemble
and display their verified selected members as an aligned multi-model PDB.

Rebuild the v3 score assets from the accepted handoff and exact input manifest:

```sh
python3 scripts/build_v3_scores.py --handoff /path/to/accepted-handoff \
  --input-spec /path/to/exact-input-manifest.json --pdf /path/to/v3-report.pdf
```

Rebuild archived comparison data from an existing RPF evidence collection:

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

## Focused two-method cohort

`cohort-2000.html` reports exactly 1,000 AFSample3 and 1,000 BioEMU2 models.
It summarizes v3 independent-model results and links to the exact focused CSV
and model browser. The archived v1 study retains four clustering residue
subsets, eight MCMC50/DISCO50 native ensemble scores, and 31 directional
Double Recall comparisons. `current/cohort-2000/report.json` pins the accepted
source hashes and complete summary; CSV downloads expose individual scores,
ordered memberships, native panel scores and all 99 representative TM triples.

The native ensemble viewer fetches each exact saved query from the public cohort
asset store and verifies its uncompressed SHA256 before rendering. Display
alignment uses the selected clustering residues; original scored coordinates
remain available separately. All eight panels link to the matching atlas view
with their exact 50 sampled members highlighted. Both discontinuous subsets have
AFSample3-only supported states; unassigned models remain in the denominator.
TM certification cores differ from clustering masks. Ensemble scores are kept
separate from independent-member medians, and Double Recall tables retain the
prediction/reference preparation caveat and directional pair counts.

```sh
python3 -m unittest discover -s tests -p test_cohort_2000.py -v
node --check cohort-2000.js
```

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
