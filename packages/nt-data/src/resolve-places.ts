/**
 * For a month's acquisitions JSON, produce a sidecar places file keyed by record id:
 *   data/places-<YYYY-MM>.json
 *
 * For each record, picks the FIRST place_ref that resolves (Pleiades preferred,
 * TGN as fallback). Unresolved records are omitted from the output — they stay
 * in acquisitions.json but don't appear on the map.
 *
 * Reads resolved places from the committed gazetteer stores only (does NOT hit
 * the network). Run `refresh-gazetteer` first to populate the stores.
 *
 * Usage:
 *   pnpm --filter @nt/data resolve-places data/acquisitions-2026-03.json 2026-03
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManualOverride, loadManualOverrides } from './gazetteer/manual.ts';
import { extractPleiadesId } from './gazetteer/pleiades.ts';
import { get, has, loadStore } from './gazetteer/store.ts';
import { extractTgnId } from './gazetteer/tgn.ts';
import type { ResolvedPlace } from './gazetteer/types.ts';
import { extractWikidataId } from './gazetteer/wikidata.ts';
import { AcquisitionsFileSchema } from './schema.ts';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: tsx src/resolve-places.ts <acquisitions.json> <YYYY-MM>');
  process.exit(2);
}
const [inputPath, monthKey] = args as [string, string];
if (!/^\d{4}-\d{2}$/.test(monthKey)) {
  console.error(`second argument must be YYYY-MM; got ${monthKey}`);
  process.exit(2);
}

const root = join(import.meta.dirname, '..', 'data', 'gazetteers');
const pleiades = loadStore(join(root, 'pleiades.json'), 'pleiades');
const tgn = loadStore(join(root, 'tgn.json'), 'getty-tgn');
const wikidata = loadStore(join(root, 'wikidata.json'), 'wikidata');
const manual = loadManualOverrides(join(root, 'manual-overrides.json'));

function resolveFirst(refs: string[] | undefined): ResolvedPlace | null {
  if (!refs) return null;
  for (const uri of refs) {
    const pid = extractPleiadesId(uri);
    if (pid && has(pleiades, pid)) {
      const place = get(pleiades, pid) ?? getManualOverride(manual, uri);
      if (place) return place;
    }
    const tid = extractTgnId(uri);
    if (tid && has(tgn, tid)) {
      const place = get(tgn, tid) ?? getManualOverride(manual, uri);
      if (place) return place;
    }
    const wid = extractWikidataId(uri);
    if (wid && has(wikidata, wid)) {
      const place = get(wikidata, wid) ?? getManualOverride(manual, uri);
      if (place) return place;
    }
    const direct = getManualOverride(manual, uri);
    if (direct) return direct;
  }
  return null;
}

const parsed = AcquisitionsFileSchema.parse(JSON.parse(readFileSync(inputPath, 'utf8')));

const places: Record<string, ResolvedPlace> = {};
let hadRef = 0;
let resolved = 0;
let dropped = 0;
for (const record of parsed.records) {
  const refs = record.place_refs ?? [];
  if (refs.length > 0) hadRef += 1;
  const place = resolveFirst(refs);
  if (place) {
    places[record.id] = place;
    resolved += 1;
  } else if (refs.length > 0) {
    dropped += 1;
  }
}

const out = {
  schema_version: 1 as const,
  month: monthKey,
  generated_at: new Date().toISOString(),
  total_records: parsed.records.length,
  records_with_refs: hadRef,
  records_resolved: resolved,
  records_with_refs_unresolved: dropped,
  places,
};

const outPath = join(import.meta.dirname, '..', 'data', `places-${monthKey}.json`);
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.error(
  `${monthKey}: ${resolved} resolved / ${parsed.records.length} records ` +
    `(${dropped} have place_refs but no resolved coordinate)`,
);
console.error(`→ ${outPath}`);
