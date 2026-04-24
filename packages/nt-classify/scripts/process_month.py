#!/usr/bin/env python3
"""Run the improved classifier on one month of the shelflist + build the interactive review HTML.

Inputs:
- Full shelflist xlsx
- --month + --year (filters by Item Creation Date)
- --model (improved_calibrated_*.joblib from train_improved.py)

Outputs (to --output-dir):
- <month>_<year>_transformed.csv  (raw records)
- <month>_<year>_predictions.csv  (with predicted_category, confidence, prob_*)
- <month>_<year>_review.html      (interactive, colleague-friendly)

The HTML is a single file they open in a browser. It autosaves to localStorage
and downloads a corrections JSON when done.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import joblib
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from generate_interactive_review import CATEGORIES, HTML_TEMPLATE  # noqa: E402

HEADER_ROW = 7


def clean_str(value) -> str | None:
    """Return a trimmed string, or None for missing / NaN / empty / literal 'nan'."""
    if value is None:
        return None
    # pandas NaN is a float; bool(nan) is True, so an `x or ""` guard isn't enough.
    if isinstance(value, float) and pd.isna(value):
        return None
    s = str(value).strip()
    if not s or s.lower() == "nan":
        return None
    return s


def prepare_X(df: pd.DataFrame) -> pd.DataFrame:
    subjects = df.get("Subjects", pd.Series([""] * len(df), index=df.index))
    text = (
        df["title"].fillna("").astype(str)
        + " "
        + df["call_number"].fillna("").astype(str)
        + " "
        + subjects.fillna("").astype(str)
    )
    lc_prefix = (
        df["call_number"].astype(str).str.extract(r"^([A-Z]+)", expand=False).fillna("OTHER")
    )
    return pd.DataFrame({"text": text.values, "lc_prefix": lc_prefix.values})


def load_month(xlsx: Path, month: int, year: int) -> pd.DataFrame:
    df = pd.read_excel(xlsx, header=HEADER_ROW)
    df["Item Creation Date"] = pd.to_datetime(df["Item Creation Date"], errors="coerce")
    mask = (df["Item Creation Date"].dt.month == month) & (df["Item Creation Date"].dt.year == year)
    df = df[mask].copy()
    # Clean + rename to classifier-expected columns.
    df["Permanent Call Number"] = df["Permanent Call Number"].astype(str).str.replace(
        r"\s+Non-circulating$", "", regex=True
    )
    df = df.rename(columns={
        "Barcode": "id",
        "MMS Id": "mms_id",
        "Permanent Call Number": "call_number",
        "Title": "title",
        "Item Creation Date": "date_acquired",
    })
    df = df.dropna(subset=["id", "call_number", "title"])
    return df


def render_html(predictions: pd.DataFrame, month: int, year: int, output: Path) -> None:
    month_name = datetime(year, month, 1).strftime("%B %Y")
    month_key = f"{year}-{month:02d}"
    records = []
    for _, row in predictions.iterrows():
        barcode = clean_str(row.get("id")) or ""
        publisher = clean_str(row.get("Publisher"))
        pub_date = clean_str(row.get("Publication Date"))
        publisher_line = None
        if publisher and pub_date:
            publisher_line = f"{publisher}, {pub_date}"
        elif publisher:
            publisher_line = publisher
        elif pub_date:
            publisher_line = pub_date
        bobcat_url = (
            f"https://bobcat.library.nyu.edu/primo-explore/search?query=any,contains,{barcode}&vid=NYU"
            if barcode
            else None
        )
        date_acquired = (clean_str(row.get("date_acquired")) or "").split(" ")[0]
        records.append({
            "id": barcode,
            "barcode": barcode,
            "mms_id": clean_str(row.get("mms_id")),
            "title": clean_str(row.get("title")) or "",
            "author": clean_str(row.get("Author")),
            "publisher_line": publisher_line,
            "bobcat_url": bobcat_url,
            "call_number": clean_str(row.get("call_number")) or "",
            "date_acquired": date_acquired,
            "predicted_category": clean_str(row.get("predicted_category")) or "",
            "confidence": float(row["confidence"]),
        })
    html = (
        HTML_TEMPLATE
        .replace("__MONTH_KEY__", month_key)
        .replace("__MONTH_LABEL__", month_name)
        .replace("__GENERATED_AT__", datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"))
        .replace("__RECORDS_JSON__", json.dumps(records, ensure_ascii=True))
        .replace("__CATEGORIES_JSON__", json.dumps(CATEGORIES, ensure_ascii=True))
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=Path, help="Full shelflist xlsx")
    parser.add_argument("--month", type=int, required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--model", type=Path, required=True, help="improved_calibrated_*.joblib")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    bundle = joblib.load(args.model)
    model = bundle["model"]
    classes = bundle["classes"]

    month_df = load_month(args.xlsx, args.month, args.year)
    if len(month_df) == 0:
        print(f"No records for {args.year}-{args.month:02d}", file=sys.stderr)
        return 1

    X = prepare_X(month_df)
    y_pred = model.predict(X)
    probs = model.predict_proba(X)
    max_prob = probs.max(axis=1)

    out_df = month_df.copy().reset_index(drop=True)
    out_df["predicted_category"] = y_pred
    out_df["confidence"] = max_prob
    for i, cls in enumerate(classes):
        out_df[f"prob_{cls}"] = probs[:, i]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{args.year}-{args.month:02d}"
    transformed_path = args.output_dir / f"{stem}_transformed.csv"
    predictions_path = args.output_dir / f"{stem}_predictions.csv"
    review_path = args.output_dir / f"{stem}_review.html"

    month_df.to_csv(transformed_path, index=False)
    out_df.to_csv(predictions_path, index=False)
    render_html(out_df, args.month, args.year, review_path)

    n = len(out_df)
    avg_conf = out_df["confidence"].mean()
    print(f"=== {stem} ===")
    print(f"  {n} records, mean confidence {avg_conf:.2%}")
    print(f"  High (≥80%): {(out_df['confidence'] >= 0.8).sum()}")
    print(f"  Mid (60-80%): {((out_df['confidence'] >= 0.6) & (out_df['confidence'] < 0.8)).sum()}")
    print(f"  Low (<60%): {(out_df['confidence'] < 0.6).sum()}")
    print("  Category distribution:")
    for cat, cnt in out_df["predicted_category"].value_counts().items():
        print(f"    {cat:40s} {cnt:4d}")
    print(f"  → {transformed_path.name}")
    print(f"  → {predictions_path.name}")
    print(f"  → {review_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
