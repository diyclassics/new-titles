import { type ManualOverrides, getManualOverride, loadManualOverrides } from './manual.ts';
import { extractPleiadesId, fetchPleiadesPlace } from './pleiades.ts';
import { get, has, loadStore, put, saveStore } from './store.ts';
import { extractTgnId, fetchTgnPlace } from './tgn.ts';
import type { GazetteerStore, ResolvedPlace } from './types.ts';
import { extractWikidataId, fetchWikidataPlace } from './wikidata.ts';

export interface Stores {
  pleiades: GazetteerStore;
  pleiadesPath: string;
  tgn: GazetteerStore;
  tgnPath: string;
  wikidata: GazetteerStore;
  wikidataPath: string;
  manual: ManualOverrides;
}

export function openStores(
  pleiadesPath: string,
  tgnPath: string,
  wikidataPath: string,
  manualPath: string,
): Stores {
  return {
    pleiades: loadStore(pleiadesPath, 'pleiades'),
    pleiadesPath,
    tgn: loadStore(tgnPath, 'getty-tgn'),
    tgnPath,
    wikidata: loadStore(wikidataPath, 'wikidata'),
    wikidataPath,
    manual: loadManualOverrides(manualPath),
  };
}

export function persistStores(stores: Stores): void {
  saveStore(stores.pleiadesPath, stores.pleiades);
  saveStore(stores.tgnPath, stores.tgn);
  saveStore(stores.wikidataPath, stores.wikidata);
}

/** Resolve a single URI: prefer cache, fall back to network. Stores known-missing as null.
 *  When a source-specific lookup yields null, the manual overrides file is consulted as a final fallback. */
export async function resolveUri(uri: string, stores: Stores): Promise<ResolvedPlace | null> {
  const fallback = () => getManualOverride(stores.manual, uri);

  const pleiadesId = extractPleiadesId(uri);
  if (pleiadesId) {
    if (has(stores.pleiades, pleiadesId)) {
      return get(stores.pleiades, pleiadesId) ?? fallback();
    }
    try {
      const place = await fetchPleiadesPlace(pleiadesId);
      put(stores.pleiades, pleiadesId, place);
      return place ?? fallback();
    } catch (error) {
      console.error(`pleiades ${pleiadesId}: ${(error as Error).message}`);
      return fallback();
    }
  }

  const tgnId = extractTgnId(uri);
  if (tgnId) {
    if (has(stores.tgn, tgnId)) {
      return get(stores.tgn, tgnId) ?? fallback();
    }
    try {
      const place = await fetchTgnPlace(tgnId);
      put(stores.tgn, tgnId, place);
      return place ?? fallback();
    } catch (error) {
      console.error(`tgn ${tgnId}: ${(error as Error).message}`);
      return fallback();
    }
  }

  const wikidataId = extractWikidataId(uri);
  if (wikidataId) {
    if (has(stores.wikidata, wikidataId)) {
      return get(stores.wikidata, wikidataId) ?? fallback();
    }
    try {
      const place = await fetchWikidataPlace(wikidataId);
      put(stores.wikidata, wikidataId, place);
      return place ?? fallback();
    } catch (error) {
      console.error(`wikidata ${wikidataId}: ${(error as Error).message}`);
      return fallback();
    }
  }

  return fallback();
}
