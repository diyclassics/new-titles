#!/usr/bin/env python3
"""Ingest a colleague's corrections JSON (from the review HTML) into the ledger.

Run this after the colleague sends back an isaw-corrections-YYYY-MM.json file.
Every record with status=="changed" gets a ledger entry. Unchanged records are
skipped.

Usage:
    python ingest_corrections.py path/to/isaw-corrections-2026-03.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from corrections_ledger import LedgerEntry, append, latest_by_id, now_iso


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corrections_json", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = json.loads(args.corrections_json.read_text(encoding="utf-8"))
    month = data["month"]
    existing = latest_by_id()
    ts = now_iso()

    new_entries: list[LedgerEntry] = []
    redundant = 0  # already in ledger with same final_category
    for item in data["items"]:
        if item.get("status") != "changed":
            continue
        record_id = str(item["id"])
        entry = LedgerEntry(
            ts=ts,
            id=record_id,
            barcode=str(item.get("barcode") or "") or None,
            mms_id=str(item.get("mms_id") or "") or None,
            title=str(item.get("title") or ""),
            month=month,
            original_category=str(item["original_category"]),
            final_category=str(item["final_category"]),
            source="review",
            reason=None,
        )
        prev = existing.get(record_id)
        if prev and prev.final_category == entry.final_category:
            redundant += 1
            continue
        new_entries.append(entry)

    print(f"Corrections JSON: {args.corrections_json}")
    print(f"  Month: {month}")
    print(f"  Total items in file:        {len(data['items'])}")
    print(f"  Marked 'changed':           {sum(1 for i in data['items'] if i.get('status') == 'changed')}")
    print(f"  Already in ledger same cat: {redundant}")
    print(f"  New ledger entries to add:  {len(new_entries)}")

    if args.dry_run:
        print("\n(dry-run — no changes written)")
        return 0

    for e in new_entries:
        append(e)

    if new_entries:
        print(f"\nAppended {len(new_entries)} entries to the ledger.")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
