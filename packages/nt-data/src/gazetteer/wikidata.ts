import { rateLimit } from './rate-limit.ts';
import type { ResolvedPlace } from './types.ts';

const WIKIDATA_HOST = 'www.wikidata.org';
const USER_AGENT = 'nt-data/0.0 (https://github.com/diyclassics/new-titles)';

export function extractWikidataId(uri: string): string | null {
  const match = /wikidata\.org\/(?:entity|wiki)\/(Q\d+)/.exec(uri);
  return match ? (match[1] ?? null) : null;
}

interface CoordValue {
  latitude?: number;
  longitude?: number;
}

interface WbEntity {
  id?: string;
  labels?: Record<string, { value?: string }>;
  claims?: {
    P625?: Array<{
      mainsnak?: { datavalue?: { value?: CoordValue } };
    }>;
  };
}

interface WbResponse {
  entities?: Record<string, WbEntity>;
}

export async function fetchWikidataPlace(id: string): Promise<ResolvedPlace | null> {
  await rateLimit(WIKIDATA_HOST);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=labels%7Cclaims&languages=en&format=json`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikidata ${id}: HTTP ${response.status}`);
  const data = (await response.json()) as WbResponse;
  const entity = data.entities?.[id];
  if (!entity) return null;
  const coord = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (!coord || typeof coord.latitude !== 'number' || typeof coord.longitude !== 'number') {
    return null;
  }
  const label = entity.labels?.en?.value ?? id;
  return {
    id: `wikidata:${id}`,
    name: label,
    lat: coord.latitude,
    lon: coord.longitude,
    source: 'wikidata',
    uri: `https://www.wikidata.org/wiki/${id}`,
  };
}
