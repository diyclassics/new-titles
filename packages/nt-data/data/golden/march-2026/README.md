# March 2026 — golden reference

Generated 2026-04-24 via the old nt-classify pipeline at `intm2/nt-old/new-titles-v2.backup/nt-classify/`. Used as the regression baseline for the new monorepo pipeline through 5/15 launch.

## Source

Filtered `2026-04-24 NISAW full shelflist.xlsx` to records with `Item Creation Date` in March 2026 (2026-03-01 through 2026-03-31). 357 records of 60,709 total.

## Files

- `ISAW-New-titles-Mar-2026.xlsx` — filtered input to the pipeline (357 records, header on row 8 / `header=7` 0-indexed as expected by `process_monthly_report.py`)
- `mar_2026_transformed.csv` — post-column-rename + null-drop (Step 1 output)
- `mar_2026_predictions.csv` — classifier output: `predicted_category`, `confidence`, `prob_<cat>` for each of 7 categories
- `mar_2026_review.html` — internal review with color-coded confidence
- `mar_2026_final.html` — publication HTML (generated directly from predictions; not human-corrected)

## Pipeline run

Model: `models/model_20260211_104243.joblib` (7-class SGD + TF-IDF). Loaded cleanly in sklearn 1.8.0 from joblib 1.5.3.

Distribution (predicted, uncorrected):
- The Caucasus & The Western Steppe: 179 (88.6% avg conf)
- China, South Asia, & East Asia: 93 (92.7%)
- Ancient Western Asia: 44 (76.4%)
- European and Classical Antiquity: 16 (63.5%)
- Egypt & North Africa: 12 (64.3%)
- Cross-Cultural Studies & Other: 9 (57.5%)
- Central Asia & Siberia: 4 (59.3%)

Overall avg confidence 85.1%. 239 high-conf (>80%), 88 medium, 30 low.

**Note:** Caucasus dominance (50% of corpus) is unusual compared to Dec 2025 and likely reflects either a large series acquisition or classifier drift. Flag for review before publishing; verify via the annotation CLI (`.venv/bin/python annotate.py data/processed/mar_2026_for_annotation.csv` in the old nt-classify repo) rather than treating these predictions as final.

## How to reproduce

```bash
cd intm2/nt-old/new-titles-v2.backup/nt-classify
uv venv --python 3.11 --clear
uv pip install -e . openpyxl
.venv/bin/python scripts/process_monthly_report.py \
  ../../../new-titles/packages/nt-data/data/golden/march-2026/ISAW-New-titles-Mar-2026.xlsx \
  --output-dir data/processed/
.venv/bin/python scripts/generate_review_html.py \
  data/processed/mar_2026_predictions.csv \
  reports/mar_2026_review.html --month "March 2026"
.venv/bin/python scripts/generate_final_html.py \
  data/processed/mar_2026_predictions.csv "March 2026" \
  reports/mar_2026_final.html
```
