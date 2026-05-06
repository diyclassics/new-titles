/**
 * Walk an acquisitions JSON, pre-fetch every unresolved place_ref URI,
 * and persist the results into data/gazetteers/{pleiades,tgn}.json.
 *
 * Usage:
 *   pnpm --filter @nt/data refresh-gazetteer data/acquisitions-2026-03.json
 *
 * Safe to re-run: records already present in the store are skipped.
 * Network: one request per second per host (Pleiades / Getty are separate).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPleiadesId } from './gazetteer/pleiades.ts';
import { openStores, persistStores, resolveUri } from './gazetteer/resolve.ts';
import { has } from './gazetteer/store.ts';
import { extractTgnId } from './gazetteer/tgn.ts';
import { extractWikidataId } from './gazetteer/wikidata.ts';
import { AcquisitionsFileSchema } from './schema.ts';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: tsx src/refresh-gazetteer.ts <acquisitions.json> [...acquisitions.json]');
  process.exit(2);
}

const root = join(import.meta.dirname, '..', 'data', 'gazetteers');
const stores = openStores(
  join(root, 'pleiades.json'),
  join(root, 'tgn.json'),
  join(root, 'wikidata.json'),
  join(root, 'manual-overrides.json'),
);

// Collect unique URIs across all inputs.
const uris = new Set<string>();
for (const path of args) {
  const parsed = AcquisitionsFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  for (const record of parsed.records) {
    for (const ref of record.place_refs ?? []) {
      uris.add(ref);
    }
  }
}

// Filter to URIs not yet in any store.
const toFetch: string[] = [];
for (const uri of uris) {
  const pleiadesId = extractPleiadesId(uri);
  if (pleiadesId && has(stores.pleiades, pleiadesId)) continue;
  const tgnId = extractTgnId(uri);
  if (tgnId && has(stores.tgn, tgnId)) continue;
  const wikidataId = extractWikidataId(uri);
  if (wikidataId && has(stores.wikidata, wikidataId)) continue;
  if (pleiadesId || tgnId || wikidataId) toFetch.push(uri);
}

console.error(`${uris.size} unique place_refs seen, ${toFetch.length} need fetching`);

let resolved = 0;
let missing = 0;
let i = 0;
const persistEvery = 25;

for (const uri of toFetch) {
  i += 1;
  const place = await resolveUri(uri, stores);
  if (place) {
    resolved += 1;
  } else {
    missing += 1;
  }
  if (i % 10 === 0 || i === toFetch.length) {
    process.stderr.write(`  [${i}/${toFetch.length}] resolved=${resolved} missing=${missing}\r`);
  }
  if (i % persistEvery === 0) persistStores(stores);
}

persistStores(stores);
process.stderr.write('\n');
console.error(`Done. resolved=${resolved} missing=${missing} cached=${uris.size - toFetch.length}`);
