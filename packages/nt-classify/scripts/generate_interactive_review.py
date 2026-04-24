#!/usr/bin/env python3
# ruff: noqa: E501  # HTML/JS template strings can naturally be long.
"""Generate a single-file interactive review HTML for a month's predictions.

Takes a predictions CSV (from process_monthly_report.py) and produces a self-contained
HTML file that a non-technical reviewer can open in any browser. Features:

- Per-record accept/override with a category dropdown
- Keyboard shortcuts: j/k move, v verify, 1-7 change category
- "Accept all high-confidence (>N%)" bulk action
- Filter: all / needs review / changed
- localStorage autosave (keyed by month)
- "Download corrections" button produces a JSON the user feeds to /finalize

Alpine.js is loaded from CDN; for offline use, inline alpine.min.js into this template.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

CATEGORIES = [
    "European and Classical Antiquity",
    "Egypt & North Africa",
    "Ancient Western Asia",
    "The Caucasus & The Western Steppe",
    "Central Asia & Siberia",
    "China, South Asia, & East Asia",
    "Cross-Cultural Studies & Other",
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ISAW Library Review — __MONTH_LABEL__</title>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.3/dist/cdn.min.js"></script>
<style>
body {
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.6; margin: 0; color: #000; background: #fafafa;
}
.page { max-width: 900px; margin: 0 auto; padding: 20px; padding-bottom: 140px; }
h1 { font-size: 1.5em; margin-bottom: 20px; }
h2 {
  font-size: 1.3em; margin-top: 30px; margin-bottom: 15px; color: #333;
  padding-top: 10px; border-top: 2px solid #0066cc;
}
p.record { margin-bottom: 10px; line-height: 1.6; padding: 10px 12px; border-radius: 4px;
            border-left: 4px solid transparent; background: white; border: 1px solid #e0e0e0; }
p.record.unchanged { border-left-color: #e0e0e0; }
p.record.changed   { border-left-color: #f57f17; background: #fffbeb; }
p.record.focused    { outline: 2px solid #0066cc; outline-offset: -1px; }
p.record strong em { font-weight: bold; font-style: italic; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
.back-to-top { font-size: 0.9em; margin-top: 20px; margin-bottom: 10px; }

.toc {
  margin: 20px 0; padding: 15px; background-color: #f5f5f5;
  border-left: 4px solid #0066cc;
}
.toc ul { list-style-type: none; padding-left: 0; margin: 0; }
.toc li { margin: 5px 0; font-size: 0.95em; }
.toc .count { color: #666; font-size: 0.9em; }

.toolbar {
  position: sticky; top: 0; z-index: 50; background: white; border: 1px solid #d0d0d0;
  border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.06);
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  font-size: 0.9em;
}
.toolbar .stats { flex: 1; min-width: 180px; }
.toolbar .stats strong { color: #0066cc; font-size: 1.15em; }
.toolbar .bar { height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden;
                 min-width: 180px; max-width: 250px; margin: 4px 0; }
.toolbar .bar .fill { height: 100%; background: #2e7d32; transition: width 0.2s; }
.btn {
  padding: 6px 12px; border: 1px solid #d0d0d0; background: white; border-radius: 4px;
  font-size: 0.85em; cursor: pointer; font-family: inherit; color: #333;
}
.btn:hover { background: #f5f5f5; }
.btn.primary { background: #0066cc; color: white; border-color: #0066cc; }
.btn.primary:hover { background: #0050a0; }
.btn.success { background: #2e7d32; color: white; border-color: #2e7d32; }
.btn.success:hover { background: #1b5e20; }
.btn.danger { color: #c62828; }
.filters { display: inline-flex; gap: 10px; align-items: center; font-size: 0.9em; }
.filters label { cursor: pointer; }

.share-note {
  background: #fffde7; border: 1px solid #fbc02d; padding: 12px 16px; border-radius: 4px;
  margin-bottom: 16px; font-size: 0.9em; line-height: 1.5;
}
.share-note strong { color: #e65100; }

.rec-actions {
  display: inline-flex; gap: 6px; align-items: center; margin-left: 12px;
  font-size: 0.85em; vertical-align: middle;
}
.rec-actions .conf {
  font-weight: 600; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;
}
.conf.high { background: #c8e6c9; color: #2e7d32; }
.conf.mid  { background: #fff9c4; color: #f57f17; }
.conf.low  { background: #ffccbc; color: #c62828; }
.rec-actions select {
  padding: 3px 6px; font-size: 0.82em; border: 1px solid #ccc; border-radius: 3px;
  font-family: inherit; max-width: 240px;
}
.status-tag {
  display: inline-block; font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.5px;
  padding: 2px 6px; border-radius: 2px; margin-left: 6px; vertical-align: middle;
  color: #f57f17; border: 1px solid #f57f17;
}
.undo-link {
  font-size: 0.8em; margin-left: 6px; cursor: pointer; color: #666; text-decoration: underline;
  background: none; border: none; padding: 0; font-family: inherit;
}
.undo-link:hover { color: #c62828; }
.meta-line { color: #666; font-size: 0.85em; margin-left: 4px; }

.help {
  font-size: 0.85em; color: #555; background: #e3f2fd; padding: 10px 14px;
  border-radius: 4px; margin-bottom: 16px;
}
.help kbd {
  background: white; border: 1px solid #bbb; border-bottom-width: 2px; border-radius: 3px;
  padding: 0 5px; font-family: monospace; font-size: 0.9em;
}

.download-footer {
  position: fixed; bottom: 0; left: 0; right: 0; background: white;
  border-top: 2px solid #0066cc; padding: 10px 20px; z-index: 100;
  box-shadow: 0 -2px 6px rgba(0,0,0,0.08);
  display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap;
  font-size: 0.9em;
}
.download-footer .unsaved-warning {
  color: #c62828; font-weight: 600;
}
footer.sig { text-align: center; color: #666; font-size: 0.8em; margin-top: 40px; }
</style>
</head>
<body>
<div class="page" x-data="reviewApp()" x-init="init()">

  <h1>ISAW Library New Titles — __MONTH_LABEL__ (Review)</h1>

  <div class="share-note">
    <strong>How to use:</strong> Everything is <em>assumed correct</em> unless you change it. Scan the list and
    change the category dropdown <em>only</em> for records that are misclassified. When you're done (or at
    intervals), click <strong>Download corrections</strong> at the bottom to produce a
    <code>isaw-corrections-__MONTH_KEY__.json</code> file and send it back to Patrick.
    Changes save to this browser as you work, but only in <em>this</em> browser — don't clear browser data
    before you've downloaded.
  </div>

  <div class="toolbar">
    <div class="stats">
      <div><strong x-text="changedCount()"></strong> correction<span x-show="changedCount() !== 1">s</span>
        out of <span x-text="records.length"></span> records</div>
      <div class="bar" x-show="changedCount() > 0"><div class="fill" :style="`width: ${changedPct()}%`"></div></div>
    </div>
    <div class="filters">
      <label><input type="radio" value="all" x-model="filter"> All</label>
      <label><input type="radio" value="changed" x-model="filter"> Corrections only</label>
      <label><input type="radio" value="lowconf" x-model="filter"> Low confidence (&lt;60%)</label>
    </div>
    <button class="btn danger" @click="reset()" title="Undo all corrections for this month">Clear all corrections</button>
  </div>

  <div class="help">
    <strong>Keyboard:</strong>
    <kbd>j</kbd>/<kbd>k</kbd> next/prev record ·
    <kbd>1</kbd>–<kbd>7</kbd> correct focused record to category N ·
    <kbd>u</kbd> undo correction on focused record
  </div>

  <div class="toc">
    <strong>Table of Contents:</strong>
    <ul>
      <template x-for="cat in allCategoriesWithRecords()" :key="cat">
        <li>
          <a :href="'#' + anchor(cat)" x-text="cat"></a>
          <span class="count">
            (<span x-text="totalInCategory(cat)"></span>
            <template x-if="changedInCategory(cat) > 0">
              <span> · <span x-text="changedInCategory(cat)"></span> corrected</span>
            </template>)
          </span>
        </li>
      </template>
    </ul>
  </div>

  <template x-for="cat in visibleCategories()" :key="cat">
    <section>
      <h2 :id="anchor(cat)">
        <span x-text="cat"></span>
        <span style="font-weight: normal; font-size: 0.75em; color: #666;">
          (<span x-text="visibleInCategory(cat).length"></span> shown /
          <span x-text="totalInCategory(cat)"></span> total)
        </span>
      </h2>
      <template x-for="r in visibleInCategory(cat)" :key="r.id">
        <p class="record" :class="statusClass(r) + (isFocused(r) ? ' focused' : '')"
           @click="focusRec(r)" :data-id="r.id">
          <strong><em x-text="r.title"></em></strong>
          <span class="meta-line" x-show="r.author"><br>By <span x-text="r.author"></span></span>
          <span class="meta-line" x-show="r.publisher_line"><br><span x-text="r.publisher_line"></span></span>
          <br><span style="font-family: monospace; color: #c62828;" x-text="r.call_number"></span>
          <span class="meta-line"> · acquired <span x-text="r.date_acquired"></span></span>
          <br><template x-if="r.bobcat_url"><a :href="r.bobcat_url" target="_blank">View item in Bobcat</a></template>
          <span class="rec-actions">
            <span class="conf" :class="confClass(r)" x-text="(r.confidence * 100).toFixed(0) + '%'"
                  :title="'Model confidence in its prediction'"></span>
            <select @click.stop @change="changeCat(r, $event.target.value)"
                    :title="r.status === 'changed' ? 'Corrected to ' + r.final_category : 'Change category if wrong'">
              <template x-for="cat in categories" :key="cat">
                <option :value="cat" x-text="cat" :selected="r.final_category === cat"></option>
              </template>
            </select>
            <template x-if="r.status === 'changed'">
              <span>
                <span class="status-tag">moved from <span x-text="r.predicted_category"></span></span>
                <button class="undo-link" @click.stop="unset(r)" title="Revert to original prediction">undo</button>
              </span>
            </template>
          </span>
        </p>
      </template>
      <p class="back-to-top"><em><a href="#">Back to top</a></em></p>
    </section>
  </template>

  <footer class="sig">
    ISAW Library Review · Generated __GENERATED_AT__ · Changes save to this browser only — download corrections to share.
  </footer>

  <div class="download-footer">
    <span>
      <strong x-text="changedCount()"></strong> correction<span x-show="changedCount() !== 1">s</span>
      out of <span x-text="records.length"></span> records
    </span>
    <button class="btn primary" @click="downloadCorrections()">⬇ Download corrections</button>
    <span x-show="unsaved() > 0" class="unsaved-warning">
      ⚠ <span x-text="unsaved()"></span> new change<span x-show="unsaved() !== 1">s</span> since last download — download again to persist.
    </span>
  </div>
</div>

<script id="records-data" type="application/json">__RECORDS_JSON__</script>
<script>
const CATEGORIES = __CATEGORIES_JSON__;
const MONTH_KEY = "__MONTH_KEY__";
const STORAGE_KEY = `isaw-review-${MONTH_KEY}`;
const DOWNLOAD_KEY = `isaw-review-${MONTH_KEY}-downloaded-at`;

function reviewApp() {
  return {
    categories: CATEGORIES,
    records: [],
    filter: 'all',
    focusedId: null,
    lastDownloadAt: null,

    init() {
      if (this.records.length > 0) return; // guard against double-mount (two x-data scopes)
      const raw = JSON.parse(document.getElementById('records-data').textContent);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      this.lastDownloadAt = localStorage.getItem(DOWNLOAD_KEY);
      this.records = raw.map(r => {
        const s = saved[r.id];
        return {
          ...r,
          final_category: s?.final_category ?? r.predicted_category,
          status: s?.status ?? 'unchanged',
          touched_at: s?.touched_at,
        };
      });
      window.addEventListener('keydown', (e) => this.handleKey(e));
    },

    save() {
      const now = new Date().toISOString();
      const snap = {};
      for (const r of this.records) {
        if (r.status === 'changed') {
          snap[r.id] = { status: r.status, final_category: r.final_category, touched_at: r.touched_at || now };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    },

    anchor(cat) { return 'cat-' + cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },

    changedCount()  { return this.records.filter(r => r.status === 'changed').length; },
    changedPct()    { return this.records.length === 0 ? 0 : (100 * this.changedCount() / this.records.length); },
    unsaved() {
      if (!this.lastDownloadAt) return this.changedCount();
      const cutoff = new Date(this.lastDownloadAt).getTime();
      return this.records.filter(r => r.status === 'changed' && r.touched_at && new Date(r.touched_at).getTime() > cutoff).length;
    },

    confClass(r) {
      if (r.confidence >= 0.8) return 'high';
      if (r.confidence >= 0.6) return 'mid';
      return 'low';
    },
    statusClass(r) { return r.status; },

    allCategoriesWithRecords() {
      const seen = new Set(this.records.map(r => r.predicted_category));
      return this.categories.filter(c => seen.has(c));
    },
    visibleCategories() {
      const seen = new Set();
      for (const r of this.records) {
        if (this.matchesFilter(r)) seen.add(r.predicted_category);
      }
      return this.categories.filter(c => seen.has(c));
    },
    totalInCategory(cat) { return this.records.filter(r => r.predicted_category === cat).length; },
    changedInCategory(cat) {
      return this.records.filter(r => r.predicted_category === cat && r.status === 'changed').length;
    },
    visibleInCategory(cat) {
      return this.records
        .filter(r => r.predicted_category === cat && this.matchesFilter(r))
        .sort((a, b) => (a.call_number || '').localeCompare(b.call_number || ''));
    },
    matchesFilter(r) {
      if (this.filter === 'all') return true;
      if (this.filter === 'changed') return r.status === 'changed';
      if (this.filter === 'lowconf') return r.confidence < 0.6;
      return true;
    },

    changeCat(r, newCat) {
      if (newCat === r.predicted_category) {
        // Effectively reverting — same as unset
        this.unset(r);
        return;
      }
      r.final_category = newCat;
      r.status = 'changed';
      r.touched_at = new Date().toISOString();
      this.save();
    },
    unset(r) {
      r.status = 'unchanged';
      r.final_category = r.predicted_category;
      r.touched_at = new Date().toISOString();
      this.save();
    },
    reset() {
      const n = this.changedCount();
      if (n === 0) return;
      if (!confirm(`Undo all ${n} correction${n === 1 ? '' : 's'} for this month?`)) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DOWNLOAD_KEY);
      this.lastDownloadAt = null;
      for (const r of this.records) {
        r.status = 'unchanged';
        r.final_category = r.predicted_category;
        r.touched_at = null;
      }
    },

    focusRec(r) { this.focusedId = r.id; },
    isFocused(r) { return this.focusedId === r.id; },
    visibleFlat() {
      const out = [];
      for (const c of this.visibleCategories()) {
        for (const r of this.visibleInCategory(c)) out.push(r);
      }
      return out;
    },
    moveFocus(delta) {
      const flat = this.visibleFlat();
      if (flat.length === 0) return;
      const idx = flat.findIndex(r => r.id === this.focusedId);
      const nextIdx = idx < 0 ? 0 : Math.max(0, Math.min(flat.length - 1, idx + delta));
      this.focusedId = flat[nextIdx].id;
      const el = document.querySelector(`p.record[data-id="${this.focusedId}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    focusedRec() { return this.records.find(r => r.id === this.focusedId); },

    handleKey(e) {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      const r = this.focusedRec();
      if (e.key === 'j') { this.moveFocus(1); e.preventDefault(); }
      else if (e.key === 'k') { this.moveFocus(-1); e.preventDefault(); }
      else if (e.key === 'u' && r) { this.unset(r); e.preventDefault(); }
      else if (/^[1-7]$/.test(e.key) && r) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < CATEGORIES.length) { this.changeCat(r, CATEGORIES[idx]); e.preventDefault(); }
      }
    },

    downloadCorrections() {
      const payload = {
        month: MONTH_KEY,
        generated_at: new Date().toISOString(),
        total: this.records.length,
        changed: this.changedCount(),
        categories: CATEGORIES,
        items: this.records.map(r => ({
          id: r.id,
          barcode: r.barcode,
          mms_id: r.mms_id,
          title: r.title,
          call_number: r.call_number,
          date_acquired: r.date_acquired,
          original_category: r.predicted_category,
          final_category: r.final_category,
          confidence: r.confidence,
          status: r.status,  // "unchanged" or "changed"
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `isaw-corrections-${MONTH_KEY}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.lastDownloadAt = new Date().toISOString();
      localStorage.setItem(DOWNLOAD_KEY, this.lastDownloadAt);
    },
  };
}
</script>
</body>
</html>
"""


def build_records(predictions_csv: Path) -> list[dict]:
    df = pd.read_csv(predictions_csv)
    records = []
    for _, row in df.iterrows():
        r = {
            "id": str(row["id"]),
            "barcode": str(row["id"]),  # id is barcode in this pipeline
            "mms_id": str(row.get("mms_id", "")) or None,
            "title": str(row["title"]),
            "author": str(row.get("Author") or "") or None,
            "call_number": str(row.get("call_number", "") or ""),
            "date_acquired": str(row.get("date_acquired", "") or "").split(" ")[0],
            "predicted_category": str(row["predicted_category"]),
            "confidence": float(row["confidence"]),
        }
        records.append(r)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("predictions_csv", type=Path)
    parser.add_argument("--month-key", required=True, help="e.g. 2026-03")
    parser.add_argument("--month-label", required=True, help="e.g. 'March 2026'")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    records = build_records(args.predictions_csv)
    html = (
        HTML_TEMPLATE
        .replace("__MONTH_KEY__", args.month_key)
        .replace("__MONTH_LABEL__", args.month_label)
        .replace("__GENERATED_AT__", datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"))
        .replace("__RECORDS_JSON__", json.dumps(records, ensure_ascii=True))
        .replace("__CATEGORIES_JSON__", json.dumps(CATEGORIES, ensure_ascii=True))
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")
    print(f"Wrote interactive review for {len(records)} records → {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
