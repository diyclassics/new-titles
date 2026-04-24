#!/usr/bin/env bash
# Batch-generate interactive review HTMLs for a range of months.
#
# Usage:
#   ./generate_backlog.sh 2024-01 2025-12
#
# For each month in the range it runs process_month.py, which filters the
# newest shelflist xlsx to that month and emits predictions CSV + review HTML
# into packages/nt-data/data/golden/<month-name>-<year>/.
#
# No gazetteer / places / finalize step — those come after corrections are in.
# The colleague can start reviewing the generated *_review.html files immediately.

set -euo pipefail

START=${1:?start month YYYY-MM required}
END=${2:?end month YYYY-MM required}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PKG_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
MONOREPO_ROOT=$(cd "$PKG_DIR/../.." && pwd)
GOLDEN_ROOT="$MONOREPO_ROOT/packages/nt-data/data/golden"
SHELF=$(ls -t "$MONOREPO_ROOT/packages/nt-data/data/exports/"*.xlsx | head -1)
MODEL=$(ls -t "$PKG_DIR/models/"improved_calibrated_*.joblib | head -1)

echo "Shelflist: $SHELF"
echo "Model:     $MODEL"
echo "Range:     $START → $END"
echo

month_name() {
  # 01 → january, 02 → february, ...
  local mm=$1
  case "$mm" in
    01) echo january  ;; 02) echo february ;; 03) echo march     ;;
    04) echo april    ;; 05) echo may      ;; 06) echo june      ;;
    07) echo july     ;; 08) echo august   ;; 09) echo september ;;
    10) echo october  ;; 11) echo november ;; 12) echo december  ;;
  esac
}

cur=$START
while [[ "$cur" < "$END" ]] || [[ "$cur" == "$END" ]]; do
  year=${cur%-*}
  mm=${cur#*-}
  mname=$(month_name "$mm")
  out_dir="$GOLDEN_ROOT/$mname-$year"

  if [[ -f "$out_dir/${cur}_review.html" ]]; then
    echo "[$cur] already has review.html — skipping (delete to regenerate)"
  else
    echo "[$cur] generating..."
    cd "$PKG_DIR"
    uv run scripts/process_month.py "$SHELF" \
        --month "${mm#0}" --year "$year" \
        --model "$MODEL" \
        --output-dir "$out_dir" 2>&1 | grep -E "records|→" | sed 's/^/    /'
  fi

  # Advance by one month
  if [[ "$mm" == "12" ]]; then
    cur="$((year + 1))-01"
  else
    next=$(printf "%02d" $((10#$mm + 1)))
    cur="$year-$next"
  fi
done

echo
echo "Done. Review HTMLs under $GOLDEN_ROOT/<month-name>-<year>/<YYYY-MM>_review.html"
