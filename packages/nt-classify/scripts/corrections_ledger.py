"""Append-only corrections ledger.

The ledger is the single source of truth for labels applied AFTER the classifier
predicted. Any correction — whether from a colleague's monthly review or a posthoc
"I noticed this was wrong" — gets appended as a single JSON-line entry.

Entries for the same record id are fine: latest timestamp wins when reading.
The file is never rewritten, only appended. That makes backup/rollback trivial.

Entry schema:
    {
        "ts": "2026-04-24T17:30:00Z",
        "id": "31154069010625",           # barcode, matches shelflist id
        "barcode": "31154069010625",
        "mms_id": "9998789467407876",
        "title": "<title>",                # for human audit
        "month": "2026-03",                # YYYY-MM of acquisition, for slicing
        "original_category": "...",        # what the model predicted
        "final_category": "...",           # corrected label
        "source": "review" | "posthoc",    # how this got into the ledger
        "reason": "<free text>" | null     # why (optional, required for posthoc)
    }
"""
from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

LEDGER_PATH = Path(__file__).resolve().parent.parent / "data" / "corrections-ledger.jsonl"


@dataclass
class LedgerEntry:
    ts: str
    id: str
    barcode: str | None
    mms_id: str | None
    title: str
    month: str
    original_category: str
    final_category: str
    source: Literal["review", "posthoc"]
    reason: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def append(entry: LedgerEntry, ledger_path: Path = LEDGER_PATH) -> None:
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8") as fh:
        fh.write(entry.to_json() + "\n")


def iter_entries(ledger_path: Path = LEDGER_PATH) -> Iterator[LedgerEntry]:
    if not ledger_path.exists():
        return
    with ledger_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            yield LedgerEntry(**json.loads(line))


def latest_by_id(ledger_path: Path = LEDGER_PATH) -> dict[str, LedgerEntry]:
    """Return dict mapping record id → the LATEST ledger entry for that id."""
    latest: dict[str, LedgerEntry] = {}
    for e in iter_entries(ledger_path):
        prev = latest.get(e.id)
        if prev is None or e.ts >= prev.ts:
            latest[e.id] = e
    return latest


def entries_for_month(month: str, ledger_path: Path = LEDGER_PATH) -> list[LedgerEntry]:
    return [e for e in iter_entries(ledger_path) if e.month == month]


def history_for_id(record_id: str, ledger_path: Path = LEDGER_PATH) -> list[LedgerEntry]:
    return sorted(
        (e for e in iter_entries(ledger_path) if e.id == record_id),
        key=lambda e: e.ts,
    )
