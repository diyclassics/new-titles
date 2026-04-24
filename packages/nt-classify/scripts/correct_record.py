#!/usr/bin/env python3
"""Posthoc one-off correction. Append a single record override to the ledger.

Use when a publication HTML has already gone out and someone notices a
misclassification. After running, re-run `/finalize --month YYYY-MM` to
regenerate that month's publication HTML with the correction applied.

Usage:
    # by barcode, if you have it
    python correct_record.py --barcode 31154069010625 \
        --category "Ancient Western Asia" \
        --reason "colleague flagged: this is a Mesopotamian archaeology monograph, not Caucasus"

    # by title search (first match wins; confirm interactively)
    python correct_record.py --title "Banber Matenadarani" \
        --category "..." --reason "..."

Looks the record up in the most recent per-month predictions CSV, so the
script knows which month to write to the ledger.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd
from corrections_ledger import LedgerEntry, append, history_for_id, now_iso

CATEGORIES = [
    "European and Classical Antiquity",
    "Egypt & North Africa",
    "Ancient Western Asia",
    "The Caucasus & The Western Steppe",
    "Central Asia & Siberia",
    "China, South Asia, & East Asia",
    "Cross-Cultural Studies & Other",
]


MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}_predictions\.csv$")


def find_predictions(predictions_dir: Path) -> list[Path]:
    """Every YYYY-MM_predictions.csv we can find, in reverse chronological order."""
    files = [p for p in predictions_dir.rglob("*_predictions.csv") if MONTH_PATTERN.match(p.name)]
    return sorted(files, reverse=True)


def lookup_record(
    predictions_dir: Path,
    barcode: str | None,
    mms_id: str | None,
    title_substr: str | None,
) -> tuple[dict, str] | None:
    """Search predictions CSVs for a matching record. Returns (record_dict, month) or None."""
    for path in find_predictions(predictions_dir):
        df = pd.read_csv(path, dtype={"id": str, "mms_id": str})
        # Derive month from filename: e.g. "2026-03_predictions.csv"
        month = path.stem.split("_")[0]
        if barcode:
            match = df[df["id"].astype(str) == barcode]
            if len(match) > 0:
                return match.iloc[0].to_dict(), month
        elif mms_id:
            if "mms_id" in df.columns:
                match = df[df["mms_id"].astype(str) == mms_id]
                if len(match) > 0:
                    return match.iloc[0].to_dict(), month
        elif title_substr:
            mask = df["title"].astype(str).str.contains(title_substr, case=False, regex=False, na=False)
            match = df[mask]
            if len(match) > 0:
                return match.iloc[0].to_dict(), month
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--barcode", help="Record barcode (preferred — unambiguous)")
    g.add_argument("--mms-id", help="Alma MMS Id")
    g.add_argument("--title", help="Substring match against title (uses first hit)")
    parser.add_argument("--category", required=True, choices=CATEGORIES)
    parser.add_argument("--reason", required=True, help="Short explanation — stored in the ledger")
    parser.add_argument(
        "--predictions-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent
        / "nt-data"
        / "data"
        / "golden",
        help="Root dir containing <month>/*_predictions.csv files",
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    hit = lookup_record(args.predictions_dir, args.barcode, args.mms_id, args.title)
    if hit is None:
        print(f"No matching record found in {args.predictions_dir}", file=sys.stderr)
        return 1
    record, month = hit

    barcode = str(record.get("id") or "")
    mms_id = str(record.get("mms_id") or "")
    title = str(record.get("title") or "")
    original_category = str(record.get("predicted_category") or "")

    # Include ledger history if present
    prior = history_for_id(barcode)

    print("Matched record:")
    print(f"  Month:    {month}")
    print(f"  Barcode:  {barcode}")
    print(f"  MMS Id:   {mms_id}")
    print(f"  Title:    {title}")
    print(f"  Original: {original_category}")
    print(f"  New:      {args.category}")
    print(f"  Reason:   {args.reason}")
    if prior:
        print(f"\n  Prior ledger entries for this record ({len(prior)}):")
        for e in prior:
            print(
                f"    {e.ts}  {e.source:8s}  {e.original_category!r} → {e.final_category!r}  "
                f"({e.reason or 'no reason'})"
            )

    if original_category == args.category:
        print("\nNothing to do — new category == original prediction.")
        return 0

    if not args.yes:
        confirm = input("\nAppend this correction to the ledger? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return 1

    entry = LedgerEntry(
        ts=now_iso(),
        id=barcode,
        barcode=barcode or None,
        mms_id=mms_id or None,
        title=title,
        month=month,
        original_category=original_category,
        final_category=args.category,
        source="posthoc",
        reason=args.reason,
    )
    append(entry)
    print(f"\nAppended to ledger. Re-run `finalize --month {month}` to regenerate the publication HTML.")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
