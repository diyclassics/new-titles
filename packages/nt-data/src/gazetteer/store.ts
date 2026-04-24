import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GazetteerStore, PlaceSource, ResolvedPlace } from './types.ts';

export function loadStore(path: string, source: PlaceSource): GazetteerStore {
  if (!existsSync(path)) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source,
      entries: {},
    };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as GazetteerStore;
  if (raw.source !== source) {
    throw new Error(`Store at ${path} is for source "${raw.source}", expected "${source}"`);
  }
  return raw;
}

export function saveStore(path: string, store: GazetteerStore): void {
  mkdirSync(dirname(path), { recursive: true });
  store.generated_at = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

export function has(store: GazetteerStore, id: string): boolean {
  return Object.hasOwn(store.entries, id);
}

export function get(store: GazetteerStore, id: string): ResolvedPlace | null | undefined {
  return store.entries[id];
}

export function put(store: GazetteerStore, id: string, value: ResolvedPlace | null): void {
  store.entries[id] = value;
}
