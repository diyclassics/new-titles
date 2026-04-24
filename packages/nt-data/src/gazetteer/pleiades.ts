import { rateLimit } from './rate-limit.ts';
import type { ResolvedPlace } from './types.ts';

const PLEIADES_HOST = 'pleiades.stoa.org';

/** Extract the numeric ID from a Pleiades URI, or null if not a Pleiades URI. */
export function extractPleiadesId(uri: string): string | null {
  const match = /pleiades\.stoa\.org\/places\/(\d+)/.exec(uri);
  return match ? (match[1] ?? null) : null;
}

/** Hit the Pleiades API. Returns a ResolvedPlace, null (known missing), or throws on transient error. */
export async function fetchPleiadesPlace(id: string): Promise<ResolvedPlace | null> {
  await rateLimit(PLEIADES_HOST);
  const url = `https://pleiades.stoa.org/places/${id}/json`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Pleiades ${id}: HTTP ${response.status}`);
  const data = (await response.json()) as {
    reprPoint?: [number, number];
    title?: string;
    uri?: string;
  };
  if (!data.reprPoint || data.reprPoint.length !== 2) return null;
  const [lon, lat] = data.reprPoint; // Pleiades API returns [lng, lat]
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return {
    id: `pleiades:${id}`,
    name: data.title ?? `Pleiades ${id}`,
    lat,
    lon,
    source: 'pleiades',
    uri: data.uri ?? `https://pleiades.stoa.org/places/${id}`,
  };
}
