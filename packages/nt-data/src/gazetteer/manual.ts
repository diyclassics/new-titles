import { existsSync, readFileSync } from 'node:fs';
import type { ResolvedPlace } from './types.ts';

interface ManualEntry {
  name: string;
  lat: number;
  lon: number;
  note?: string;
}

interface ManualFile {
  schema_version: 1;
  description?: string;
  entries: Record<string, ManualEntry>;
}

export interface ManualOverrides {
  byUri: Record<string, ResolvedPlace>;
}

export function loadManualOverrides(path: string): ManualOverrides {
  if (!existsSync(path)) return { byUri: {} };
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ManualFile;
  const byUri: Record<string, ResolvedPlace> = {};
  for (const [uri, entry] of Object.entries(raw.entries)) {
    byUri[normalizeUri(uri)] = {
      id: `manual:${slugify(uri)}`,
      name: entry.name,
      lat: entry.lat,
      lon: entry.lon,
      source: 'manual',
      uri,
    };
  }
  return { byUri };
}

export function getManualOverride(overrides: ManualOverrides, uri: string): ResolvedPlace | null {
  return overrides.byUri[normalizeUri(uri)] ?? null;
}

function normalizeUri(uri: string): string {
  return uri
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function slugify(uri: string): string {
  return uri
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-40);
}
