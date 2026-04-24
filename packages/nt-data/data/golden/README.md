# ISAW New Titles — monthly review backlog

One folder per month. Each folder contains the interactive review HTML the
colleague opens in a browser, the classifier's predictions, and (after
finalize) the publication HTML + corrected CSV.

## For reviewers

For each month, open `YYYY-MM_review.html` in a browser. Everything is
assumed correct — change the category dropdown only on records that are
misclassified. When done, click **Download corrections** at the bottom.
Send the JSON file (e.g. `isaw-corrections-2026-01.json`) back to Patrick.

Your work saves to the browser's local storage as you go, but download
corrections periodically — clearing browser data loses unsaved work.

## Months queued for review

### 2026

| Month | Records | Review HTML |
|---|---|---|
| January | 83 | `january-2026/2026-01_review.html` |
| February | 105 | `february-2026/2026-02_review.html` |
| March | 357 | `march-2026/2026-03_review.html` |

### 2025

| Month | Records | Review HTML |
|---|---|---|
| January | 78 | `january-2025/2025-01_review.html` |
| February | 150 | `february-2025/2025-02_review.html` |
| March | 111 | `march-2025/2025-03_review.html` |
| April | 77 | `april-2025/2025-04_review.html` |
| May | 36 | `may-2025/2025-05_review.html` |
| June | 70 | `june-2025/2025-06_review.html` |
| July | 159 | `july-2025/2025-07_review.html` |
| August | 92 | `august-2025/2025-08_review.html` |
| September | 100 | `september-2025/2025-09_review.html` |
| October | 135 | `october-2025/2025-10_review.html` |
| November | 83 | `november-2025/2025-11_review.html` |
| December | 60 | *already published — skip* |

### 2024

| Month | Records | Review HTML |
|---|---|---|
| January | 85 | `january-2024/2024-01_review.html` |
| February | 82 | `february-2024/2024-02_review.html` |
| March | 136 | `march-2024/2024-03_review.html` |
| April | 177 | `april-2024/2024-04_review.html` |
| May | 235 | `may-2024/2024-05_review.html` |
| June | 124 | `june-2024/2024-06_review.html` |
| July | 81 | `july-2024/2024-07_review.html` |
| August | 59 | `august-2024/2024-08_review.html` |
| September | 49 | `september-2024/2024-09_review.html` |
| October | 103 | `october-2024/2024-10_review.html` |
| November | 141 | `november-2024/2024-11_review.html` |
| December | 75 | `december-2024/2024-12_review.html` |

**Total queued: ~2,900 records across 26 months.**

## For Patrick

After a corrections JSON comes back, run `/finalize`:

```bash
cd packages/nt-classify
uv run scripts/ingest_corrections.py \
    ../nt-data/data/golden/january-2025/isaw-corrections-2025-01.json
uv run scripts/finalize.py --month 2025-01
```

That writes `<month-folder>/YYYY-MM_final.html` (publication HTML) and
updates `packages/nt-data/data/classifications-YYYY-MM.json` for the map.

After several months' corrections are in, retrain the classifier:

```bash
cd packages/nt-classify
uv run scripts/train_improved.py    # check the frozen-test metrics
uv run scripts/evaluate_frozen.py \
    --classifier-src src --model-dir models \
    --label "post-<batch> retrain"
```

If macro-F1 is better than the current baseline, deploy the new model
(update the `models/` symlink or pointer).
