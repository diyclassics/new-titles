#!/usr/bin/env python3
"""Convert a librarian xlsx shelflist export into canonical acquisitions JSON.

Reads the xlsx (headers at row 7, 0-indexed, matching the NISAW shelflist format),
optionally filters to a given month via `Item Creation Date`, and emits a JSON file
whose shape matches the `AcquisitionsFileSchema` in `../src/schema.ts`.

Runs under uv; no package install needed beyond pandas + openpyxl.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

HEADER_ROW = 7  # 0-indexed. Row 8 when viewed in Excel.

REQUIRED_COLS = [
    "Barcode",
    "MMS Id",
    "Permanent Call Number",
    "Title",
    "Item Creation Date",
]
OPTIONAL_COLS = [
    "Author",
    "Publisher",
    "Publication Date",
    "Publication Place",
    "Subjects",
    "651$$0",
    "Location Name",
    "Material Type",
]


def parse_semicolons(value) -> list[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    parts = [p.strip() for p in str(value).split(";")]
    return [p for p in parts if p]


def parse_place_refs(value) -> list[str]:
    """Extract Pleiades/Getty TGN URIs from the 651$$0 column."""
    refs = []
    for item in parse_semicolons(value):
        if "pleiades.stoa.org/places/" in item or "vocab.getty.edu/tgn/" in item:
            refs.append(item.rstrip("/"))
    return refs


def clean_call_number(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip()
    return re.sub(r"\s+Non-circulating$", "", s) or None


def to_iso_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and pd.isna(value):
        return None
    # Fall back to pandas parsing for strings.
    try:
        ts = pd.to_datetime(value, errors="coerce")
        if pd.isna(ts):
            return None
        return ts.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def str_or_none(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    s = str(value).strip()
    return s or None


def row_to_record(row: pd.Series) -> dict:
    barcode = str_or_none(row.get("Barcode"))
    mms_id = str_or_none(row.get("MMS Id"))
    title = str_or_none(row.get("Title"))
    call_number = clean_call_number(row.get("Permanent Call Number"))
    acquired_at = to_iso_date(row.get("Item Creation Date"))

    record = {
        "id": barcode or mms_id,
        "title": title,
        "acquired_at": acquired_at,
        "authors": [a for a in parse_semicolons(row.get("Author")) if a],
        "subject_headings": parse_semicolons(row.get("Subjects")),
        "place_refs": parse_place_refs(row.get("651$$0")),
        "places": [],
    }
    if barcode:
        record["barcode"] = barcode
    if mms_id:
        record["mms_id"] = mms_id
    if call_number:
        record["call_number"] = call_number

    publisher = str_or_none(row.get("Publisher"))
    if publisher:
        record["publisher"] = publisher
    pub_date = str_or_none(row.get("Publication Date"))
    if pub_date:
        record["pub_date"] = pub_date
    pub_place = str_or_none(row.get("Publication Place"))
    if pub_place:
        record["pub_place"] = pub_place

    return record


def convert(
    xlsx_path: Path,
    output_path: Path,
    month: int | None = None,
    year: int | None = None,
) -> int:
    df = pd.read_excel(xlsx_path, header=HEADER_ROW)

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing required columns: {missing}")

    # Drop header-continuation and trailer rows (empty MMS Id).
    df = df.dropna(subset=["MMS Id", "Title"])

    df["Item Creation Date"] = pd.to_datetime(df["Item Creation Date"], errors="coerce")

    if month is not None and year is not None:
        mask = (df["Item Creation Date"].dt.month == month) & (
            df["Item Creation Date"].dt.year == year
        )
        df = df[mask].copy()

    records = [row_to_record(r) for _, r in df.iterrows()]
    # Drop any record that failed to produce an id, title, or date — schema would reject.
    records = [r for r in records if r["id"] and r["title"] and r["acquired_at"]]

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "records": records,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    return len(records)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=Path, help="Path to librarian xlsx shelflist")
    parser.add_argument("--month", type=int, help="Month (1-12) to filter by Item Creation Date")
    parser.add_argument("--year", type=int, help="Year to filter by Item Creation Date")
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output JSON path (e.g. data/exports/acquisitions-2026-03.json)",
    )
    args = parser.parse_args()

    if (args.month is None) != (args.year is None):
        parser.error("--month and --year must be given together, or both omitted")

    count = convert(args.xlsx, args.output, args.month, args.year)
    filter_desc = f" for {args.year}-{args.month:02d}" if args.month else ""
    print(f"Wrote {count} records{filter_desc} → {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
