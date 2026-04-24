import { extractPleiadesId, fetchPleiadesPlace } from './pleiades.ts';
import { get, has, loadStore, put, saveStore } from './store.ts';
import { extractTgnId, fetchTgnPlace } from './tgn.ts';
import type { GazetteerStore, ResolvedPlace } from './types.ts';

export interface Stores {
  pleiades: GazetteerStore;
  pleiadesPath: string;
  tgn: GazetteerStore;
  tgnPath: string;
}

export function openStores(pleiadesPath: string, tgnPath: string): Stores {
  return {
    pleiades: loadStore(pleiadesPath, 'pleiades'),
    pleiadesPath,
    tgn: loadStore(tgnPath, 'getty-tgn'),
    tgnPath,
  };
}

export function persistStores(stores: Stores): void {
  saveStore(stores.pleiadesPath, stores.pleiades);
  saveStore(stores.tgnPath, stores.tgn);
}

/** Resolve a single URI: prefer cache, fall back to network. Stores known-missing as null. */
export async function resolveUri(uri: string, stores: Stores): Promise<ResolvedPlace | null> {
  const pleiadesId = extractPleiadesId(uri);
  if (pleiadesId) {
    if (has(stores.pleiades, pleiadesId)) return get(stores.pleiades, pleiadesId) ?? null;
    try {
      const place = await fetchPleiadesPlace(pleiadesId);
      put(stores.pleiades, pleiadesId, place);
      return place;
    } catch (error) {
      console.error(`pleiades ${pleiadesId}: ${(error as Error).message}`);
      return null;
    }
  }
  const tgnId = extractTgnId(uri);
  if (tgnId) {
    if (has(stores.tgn, tgnId)) return get(stores.tgn, tgnId) ?? null;
    try {
      const place = await fetchTgnPlace(tgnId);
      put(stores.tgn, tgnId, place);
      return place;
    } catch (error) {
      console.error(`tgn ${tgnId}: ${(error as Error).message}`);
      return null;
    }
  }
  return null;
}
