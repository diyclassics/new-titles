#!/usr/bin/env python3
"""Apply the colleague's triage list to the corrections ledger.

One-off script. Source-of-truth is the inline CORRECTIONS list below.
Run once; corrections-ledger.jsonl gets one new entry per record.

Re-run finalize.py per month afterward to regenerate classifications-*.json
and the publication HTML.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from corrections_ledger import LedgerEntry, append, latest_by_id, now_iso

NT_DATA_ROOT = HERE.parent.parent / "nt-data" / "data"

# Each tuple: (month, record_id, target_category, reason)
CORRECTIONS: list[tuple[str, str, str, str]] = [
    # === Jan 2026 ===
    ("2026-01", "31154068978095", "The Caucasus & The Western Steppe",
     "place is Caucasus mountains; classical-period work but regional scope"),
    ("2026-01", "31154068978103", "The Caucasus & The Western Steppe",
     "place is Caucasus mountains; classical-period work but regional scope"),
    ("2026-01", "31154069007704", "European and Classical Antiquity",
     "Vratsa (Bulgaria); Tribali studies — Thracian/Balkan, not cross-cultural"),
    ("2026-01", "31154069007951", "European and Classical Antiquity",
     "Aegean Sea / Pontic studies — clearly Classical, not cross-cultural"),
    ("2026-01", "31154069007829", "Ancient Western Asia",
     "Damascus to Rome — Middle East place; numismatics of the Levant"),
    ("2026-01", "31154069007845", "Ancient Western Asia",
     "Middle East place; ancient mountain narratives across the Near East"),
    ("2026-01", "31154069078481", "European and Classical Antiquity",
     "Mycenae; Linear B / Mycenaean studies belong with Classical"),
    # === Feb 2026 ===
    ("2026-02", "31154069078580", "Ancient Western Asia",
     "Assyria (kingdom); neo-Assyrian onomastica — clearly Near East, not Egypt"),
    ("2026-02", "31154069009353", "The Caucasus & The Western Steppe",
     "Moldova / Carpathian-Azov region — belongs to Caucasus & Western Steppe"),
    ("2026-02", "31154069008074", "Ancient Western Asia",
     "Arabia (region); trilith stone structures — Arabian Peninsula"),
    ("2026-02", "31154069008553", "Egypt & North Africa",
     "Ancient Egypt place; Egyptian-Canaanite contact and alphabetic writing"),
    ("2026-02", "31154069009114", "Egypt & North Africa",
     "Naqa (Sudan); Meroitic temple — North Africa, not Western Asia"),
    # === Mar 2026 ===
    ("2026-03", "31154069010385", "The Caucasus & The Western Steppe",
     "Georgia; Rustʻaveli-era Georgia — Caucasus"),
    ("2026-03", "31154069010484", "The Caucasus & The Western Steppe",
     "Tbilisi; Caucasus"),
    ("2026-03", "31154069010831", "The Caucasus & The Western Steppe",
     "Georgia; Georgian legends — Caucasus"),
    ("2026-03", "31154069010864", "The Caucasus & The Western Steppe",
     "Georgia; Georgian-language epistolary — Caucasus"),
    ("2026-03", "31154069010898", "The Caucasus & The Western Steppe",
     "Caucasus mountains; classical-period regional scope"),
    ("2026-03", "31154069011110", "The Caucasus & The Western Steppe",
     "Vani; Caucasus archaeology"),
    ("2026-03", "31154069011524", "The Caucasus & The Western Steppe",
     "Armenia (region); Caucasus"),
    ("2026-03", "31154069011581", "The Caucasus & The Western Steppe",
     "Ateni Sioni; Georgian church — Caucasus"),
    ("2026-03", "31154069011656", "The Caucasus & The Western Steppe",
     "Gelati Monastery; Georgia — Caucasus"),
    ("2026-03", "31154069079067", "The Caucasus & The Western Steppe",
     "Gelati Monastery; Georgia — Caucasus"),
    ("2026-03", "31154069010591", "European and Classical Antiquity",
     "Roman Empire place; Greco-Roman studies — Classical, not Western Asia"),
    ("2026-03", "31154069010997", "European and Classical Antiquity",
     "Noricum (province); Roman provincial archaeology — Classical"),
    ("2026-03", "31154069009494", "Egypt & North Africa",
     "Ancient Egypt place; fantastic-animal iconography in Egyptian tradition"),
]


def main() -> int:
    acq_by_month: dict[str, dict[str, dict]] = {}
    cls_by_month: dict[str, dict[str, str]] = {}

    for month in {m for m, _, _, _ in CORRECTIONS}:
        acq = json.loads((NT_DATA_ROOT / f"acquisitions-{month}.json").read_text())
        cls = json.loads((NT_DATA_ROOT / f"classifications-{month}.json").read_text())
        acq_by_month[month] = {r["id"]: r for r in acq["records"]}
        cls_by_month[month] = cls["by_id"]

    existing = latest_by_id()
    ts = now_iso()

    new_entries: list[LedgerEntry] = []
    skipped: list[tuple[str, str]] = []
    for month, record_id, target_cat, reason in CORRECTIONS:
        rec = acq_by_month[month].get(record_id)
        if rec is None:
            skipped.append((record_id, "not in acquisitions"))
            continue
        original_cat = cls_by_month[month].get(record_id)
        if original_cat is None:
            skipped.append((record_id, "not in classifications"))
            continue
        if original_cat == target_cat:
            skipped.append((record_id, "already in target category"))
            continue
        prev = existing.get(record_id)
        if prev and prev.final_category == target_cat:
            skipped.append((record_id, "already corrected in ledger"))
            continue
        new_entries.append(
            LedgerEntry(
                ts=ts,
                id=record_id,
                barcode=rec.get("barcode"),
                mms_id=rec.get("mms_id"),
                title=rec.get("title", ""),
                month=month,
                original_category=original_cat,
                final_category=target_cat,
                source="posthoc",
                reason=reason,
            )
        )

    print(f"Total triage items:   {len(CORRECTIONS)}")
    print(f"Already correct/done: {len(skipped)}")
    if skipped:
        for rid, why in skipped:
            print(f"  skip {rid}: {why}")
    print(f"New ledger entries:   {len(new_entries)}")

    for e in new_entries:
        append(e)
        print(f"  + {e.month} {e.id}  {e.original_category!r} -> {e.final_category!r}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
