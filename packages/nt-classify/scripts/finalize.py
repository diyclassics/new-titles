#!/usr/bin/env python3
"""Finalize a month: apply ledger overrides → write publication HTML.

Given a month's predictions CSV:
1. Reads all corrections-ledger entries for that month (and any posthoc overrides)
2. Applies the LATEST per-record override on top of the predictions
3. Writes a corrected CSV (<month>_corrected.csv)
4. Generates the ISAW publication HTML (<month>_final.html)

Usage:
    python finalize.py --month 2026-03
    python finalize.py --month 2026-03 --predictions-dir /path/to/golden
"""
from __future__ import annotations

import argparse
import calendar
import html
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

import pandas as pd
from corrections_ledger import entries_for_month


def bobcat_url(mms_id: str) -> str:
    """Generate a Bobcat / Primo VE deep link for an NYU MMS ID."""
    params = {
        "docid": f"alma{mms_id}",
        "context": "L",
        "vid": "01NYU_INST:NYU",
        "lang": "en",
        "search_scope": "CI_NYU_CONSORTIA",
        "adaptor": "Local Search Engine",
        "tab": "Unified_Slot",
        "offset": "0",
    }
    return f"https://search.library.nyu.edu/discovery/fulldisplay?{urlencode(params)}"


# (Display label, anchor id) in the order they appear in the TOC.
PUBLICATION_CATEGORIES = [
    ("European and Classical Antiquity", "classical"),
    ("Egypt & North Africa", "egypt"),
    ("Ancient Western Asia", "neareast"),
    ("The Caucasus & The Western Steppe", "caucasus"),
    ("Central Asia & Siberia", "centralasia"),
    ("China, South Asia, & East Asia", "eastasia"),
    ("Cross-Cultural Studies & Other", "crosscultural"),
]

CSS = """
body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; margin: 20px; color: #000; }
h1 { font-size: 1.5em; margin-bottom: 20px; }
h2 { font-size: 1.3em; margin-top: 30px; margin-bottom: 15px; color: #333; }
p { margin-bottom: 15px; line-height: 1.6; }
strong { font-weight: bold; }
em { font-style: italic; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
.back-to-top { font-size: 0.9em; margin-top: 20px; margin-bottom: 10px; }
.toc { margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #0066cc; }
.toc ul { list-style-type: none; padding-left: 0; }
.toc li { margin: 5px 0; }
""".strip()


def lc_sort_key(call: str) -> tuple:
    """Sort LC call numbers by prefix alpha, then numeric part, then full string."""
    s = (call or "").strip()
    m = re.match(r"^([A-Z]+)(\d+(?:\.\d+)?)", s)
    if m:
        return (m.group(1), float(m.group(2)), s)
    return ("ZZZ", 9e9, s)


def _clean(value) -> str:
    """Return a trimmed string, or '' for missing / NaN / empty / literal 'nan'."""
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    s = str(value).strip()
    if s.lower() == "nan":
        return ""
    return s


def render_record(row: pd.Series) -> str:
    title = html.escape(_clean(row.get("title")))
    author = _clean(row.get("Author"))
    publisher = _clean(row.get("Publisher"))
    pub_date = _clean(row.get("Publication Date"))
    call = _clean(row.get("call_number"))
    mms_id = _clean(row.get("mms_id"))

    lines = [f"<strong><em>{title}</em></strong><br>"]
    if author:
        lines.append(f"By {html.escape(author)}<br>")
    pub_bits = [p for p in (publisher, pub_date) if p]
    if pub_bits:
        lines.append(f"{html.escape(', '.join(pub_bits))}.<br>")
    if call:
        lines.append(f"{html.escape(call)}.<br>")
    if mms_id:
        lines.append(f'<a href="{html.escape(bobcat_url(mms_id))}">View item in Bobcat</a>.')
    return "<p>\n" + "\n".join(lines) + "\n</p>"


def render_html(df: pd.DataFrame, month_key: str) -> str:
    year, month = month_key.split("-")
    yr = int(year)
    mo = int(month)
    month_name = datetime(yr, mo, 1).strftime("%B")
    last_day = calendar.monthrange(yr, mo)[1]

    # Group by final_category, sort each group by LC call number
    sections = []
    toc_items = []
    for label, anchor in PUBLICATION_CATEGORIES:
        subset = df[df["final_category"] == label]
        if len(subset) == 0:
            continue
        subset = subset.assign(_sort=subset["call_number"].map(lc_sort_key)).sort_values("_sort")
        toc_items.append(f'<li><a href="#{anchor}">{html.escape(label)}</a></li>')
        records_html = "\n".join(render_record(r) for _, r in subset.iterrows())
        sections.append(
            f'<h2 id="{anchor}">{html.escape(label)}</h2>\n'
            f"{records_html}\n"
            f'<p class="back-to-top"><em><a href="#top">Back to top</a></em></p>'
        )

    toc = '<ul>\n' + '\n'.join(toc_items) + '\n</ul>' if toc_items else ''

    intro = (
        f"The following books were acquired and accessioned by the ISAW Library between "
        f"{month_name} 1, {yr} and {month_name} {last_day}, {yr}. "
        f"Items are grouped by geographic region, and sorted by Library of Congress classification."
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ISAW Library New Titles: {month_name} {yr}</title>
    <style>{CSS}</style>
</head>
<body>
<div id="content-core">
<a name="top"></a>
<h1>ISAW Library New Titles: {month_name} {yr}</h1>

<p>{intro}</p>

<div class="toc">
<strong>Table of Contents:</strong>
{toc}
</div>

{chr(10).join(sections)}

</div>
</body>
</html>
"""


def apply_ledger(df: pd.DataFrame, month_key: str) -> tuple[pd.DataFrame, int]:
    """Set df['final_category']. Latest ledger entry per id wins; otherwise use predicted."""
    df = df.copy()
    overrides: dict[str, str] = {}
    for e in entries_for_month(month_key):
        prev_ts = overrides.get(f"_ts_{e.id}", "")
        if e.ts >= prev_ts:
            overrides[e.id] = e.final_category
            overrides[f"_ts_{e.id}"] = e.ts
    n_overridden = 0
    final: list[str] = []
    for _, row in df.iterrows():
        rec_id = str(row["id"])
        predicted = str(row["predicted_category"])
        if rec_id in overrides:
            final.append(overrides[rec_id])
            if overrides[rec_id] != predicted:
                n_overridden += 1
        else:
            final.append(predicted)
    df["final_category"] = final
    return df, n_overridden


def find_predictions(predictions_dir: Path, month_key: str) -> Path | None:
    matches = list(predictions_dir.rglob(f"{month_key}_predictions.csv"))
    return matches[0] if matches else None


NT_DATA_ROOT = Path(__file__).resolve().parents[2] / "nt-data" / "data"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True, help="YYYY-MM")
    parser.add_argument(
        "--predictions-dir",
        type=Path,
        default=NT_DATA_ROOT / "golden",
    )
    parser.add_argument("--output", type=Path, help="Output HTML path (default: sibling of predictions)")
    parser.add_argument(
        "--classifications-out",
        type=Path,
        default=NT_DATA_ROOT,
        help="Directory to write classifications-<month>.json (default: packages/nt-data/data/)",
    )
    args = parser.parse_args()

    if not re.match(r"^\d{4}-\d{2}$", args.month):
        parser.error("--month must be YYYY-MM")

    pred_path = find_predictions(args.predictions_dir, args.month)
    if pred_path is None:
        print(f"No predictions file for {args.month} under {args.predictions_dir}", file=sys.stderr)
        return 1

    df = pd.read_csv(pred_path, dtype={"id": str, "mms_id": str})
    df_final, n_overridden = apply_ledger(df, args.month)

    out_dir = pred_path.parent
    corrected_path = out_dir / f"{args.month}_corrected.csv"
    df_final.to_csv(corrected_path, index=False)

    html_path = args.output or (out_dir / f"{args.month}_final.html")
    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(render_html(df_final, args.month), encoding="utf-8")

    # Sidecar JSON for the map: {id: category} map for this month.
    classifications_path = args.classifications_out / f"classifications-{args.month}.json"
    classifications_path.parent.mkdir(parents=True, exist_ok=True)
    classifications_payload = {
        "schema_version": 1,
        "month": args.month,
        "generated_at": datetime.now(UTC).isoformat(),
        "categories": [label for label, _ in PUBLICATION_CATEGORIES],
        "by_id": {str(r["id"]): str(r["final_category"]) for _, r in df_final.iterrows()},
    }
    classifications_path.write_text(
        json.dumps(classifications_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    dist = df_final["final_category"].value_counts()
    print(f"=== {args.month} finalized ===")
    print(f"  {len(df_final)} records")
    print(f"  {n_overridden} ledger overrides applied")
    print("  Final distribution:")
    for cat, cnt in dist.items():
        print(f"    {cat:40s} {cnt:4d}")
    print(f"  → {corrected_path.name}")
    print(f"  → {html_path.name}")
    print(f"  → {classifications_path}")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
