#!/usr/bin/env python3
"""Surface candidate misclassifications from a colleague's triage notes.

Reads places-*.json + classifications-*.json + acquisitions-*.json for the
2026 months and prints, per rule, the records that look mislabeled.

Output is a flat punchlist meant for human review before any ledger writes.

Usage:
    python triage_audit.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "nt-data" / "data"

CAUCASUS = "The Caucasus & The Western Steppe"
CLASSICAL = "European and Classical Antiquity"
EGYPT = "Egypt & North Africa"
NEAR_EAST = "Ancient Western Asia"
CENTRAL_ASIA = "Central Asia & Siberia"
EAST_ASIA = "China, South Asia, & East Asia"
OTHER = "Cross-Cultural Studies & Other"


def in_box(p, lat_min, lat_max, lon_min, lon_max):
    return lat_min <= p["lat"] <= lat_max and lon_min <= p["lon"] <= lon_max


def in_caucasus(p):
    # Roughly: Greater Caucasus + South Caucasus republics.
    return in_box(p, 38.5, 45.5, 38.0, 51.0)


def in_eastern_europe_or_classical(p):
    # Roman / Byzantine / European mainland — broad.
    return in_box(p, 35.0, 60.0, -12.0, 35.0)


def in_egypt_north_africa(p):
    return in_box(p, 18.0, 37.0, -18.0, 36.0)


def in_western_asia(p):
    # Levant, Mesopotamia, Anatolia, Arabia, Iran.
    return in_box(p, 12.0, 42.0, 32.0, 65.0)


def in_central_asia_or_siberia(p):
    return in_box(p, 35.0, 75.0, 50.0, 145.0)


def in_east_or_south_asia(p):
    return in_box(p, 0.0, 50.0, 65.0, 150.0)


def load_month(m: str):
    acq = json.loads((ROOT / f"acquisitions-2026-{m}.json").read_text())
    cls = json.loads((ROOT / f"classifications-2026-{m}.json").read_text())
    plc = json.loads((ROOT / f"places-2026-{m}.json").read_text())
    return acq, cls, plc


def short_title(t: str | None, n: int = 70) -> str:
    if not t:
        return "?"
    s = t.strip()
    return (s[:n] + "...") if len(s) > n else s


def print_rule(label: str, hits: list[tuple]) -> None:
    print(f"\n=== {label}  ({len(hits)} hit{'s' if len(hits) != 1 else ''}) ===")
    for h in hits:
        rid, place_name, cat, proposed, title = h
        print(f"  {rid}  {place_name!r}  is={cat!r}  → {proposed!r}")
        print(f"    {short_title(title)}")


def audit_month(m: str) -> None:
    print(f"\n\n############ 2026-{m} ############")
    acq, cls, plc = load_month(m)
    by_id = {r["id"]: r for r in acq["records"]}
    places = plc.get("places", {})
    cats: dict[str, str] = cls.get("by_id", {})

    # Rule 1 — geographic Caucasus point in a non-Caucasus category.
    hits = []
    for rid, p in places.items():
        if in_caucasus(p):
            cat = cats.get(rid)
            if cat and cat != CAUCASUS:
                rec = by_id.get(rid, {})
                hits.append((rid, p["name"], cat, CAUCASUS, rec.get("title")))
    print_rule("Caucasus geographic point in non-Caucasus category", hits)

    # Rule 2 — record in AncWestAsia whose place is geographically European.
    hits = []
    for rid, p in places.items():
        cat = cats.get(rid)
        if cat == NEAR_EAST and in_eastern_europe_or_classical(p) and not in_western_asia(p):
            rec = by_id.get(rid, {})
            hits.append((rid, p["name"], cat, CLASSICAL, rec.get("title")))
    print_rule("AncWestAsia category with European/Classical-located place", hits)

    # Rule 3 — place name contains a known mis-category keyword.
    keyword_rules = [
        # (substring (lowercase), proposed, current-must-not-be)
        ("assyria", NEAR_EAST, NEAR_EAST),
        ("naga", None, None),  # surface for review; user gave no destination
        ("moldova", CAUCASUS, CAUCASUS),
        ("arabia", NEAR_EAST, NEAR_EAST),
        ("ancient egypt", EGYPT, EGYPT),
        ("egypt", EGYPT, EGYPT),
        ("mycenae", CLASSICAL, CLASSICAL),
        ("noricum", CLASSICAL, CLASSICAL),
        ("roman empire", CLASSICAL, CLASSICAL),
    ]
    for kw, proposed, skip_if in keyword_rules:
        kw_hits = []
        for rid, p in places.items():
            if kw not in p["name"].lower():
                continue
            cat = cats.get(rid)
            if proposed is not None and cat == skip_if:
                continue
            rec = by_id.get(rid, {})
            kw_hits.append((rid, p["name"], cat, proposed or "(review)", rec.get("title")))
        if kw_hits:
            print_rule(f"Place name contains {kw!r}", kw_hits)

    # Rule 4 — Cross-Cultural records whose place is in an obvious single region.
    hits = []
    for rid, cat in cats.items():
        if cat != OTHER:
            continue
        p = places.get(rid)
        if not p:
            continue
        proposed = None
        if in_egypt_north_africa(p):
            proposed = EGYPT
        elif in_eastern_europe_or_classical(p) and not in_caucasus(p) and not in_western_asia(p):
            proposed = CLASSICAL
        elif in_caucasus(p):
            proposed = CAUCASUS
        elif in_western_asia(p):
            proposed = NEAR_EAST
        if proposed:
            rec = by_id.get(rid, {})
            hits.append((rid, p["name"], cat, proposed, rec.get("title")))
    print_rule("Cross-Cultural with a single-region resolved place", hits)

    # Rule 5 — Classical category with a place outside Europe.
    hits = []
    for rid, p in places.items():
        cat = cats.get(rid)
        if cat != CLASSICAL:
            continue
        if in_eastern_europe_or_classical(p):
            continue
        # Outside Europe — find best-fit replacement.
        proposed = None
        if in_caucasus(p):
            proposed = CAUCASUS
        elif in_western_asia(p):
            proposed = NEAR_EAST
        elif in_egypt_north_africa(p):
            proposed = EGYPT
        elif in_east_or_south_asia(p):
            proposed = EAST_ASIA
        elif in_central_asia_or_siberia(p):
            proposed = CENTRAL_ASIA
        if proposed:
            rec = by_id.get(rid, {})
            hits.append((rid, p["name"], cat, proposed, rec.get("title")))
    print_rule("Classical category with non-European place", hits)

    # Rule 6 — Central Asia & Siberia category with a place outside that area.
    hits = []
    for rid, p in places.items():
        cat = cats.get(rid)
        if cat != CENTRAL_ASIA:
            continue
        if in_central_asia_or_siberia(p):
            continue
        proposed = None
        if in_caucasus(p):
            proposed = CAUCASUS
        elif in_western_asia(p):
            proposed = NEAR_EAST
        elif in_eastern_europe_or_classical(p):
            proposed = CLASSICAL
        if proposed:
            rec = by_id.get(rid, {})
            hits.append((rid, p["name"], cat, proposed, rec.get("title")))
    print_rule("Central Asia & Siberia category with off-region place", hits)


def main() -> None:
    for m in ("01", "02", "03"):
        audit_month(m)


if __name__ == "__main__":
    main()
