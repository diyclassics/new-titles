import { rateLimit } from './rate-limit.ts';
import type { ResolvedPlace } from './types.ts';

const TGN_HOST = 'vocab.getty.edu';

/** Extract the numeric TGN ID from a Getty TGN URI, or null if not a TGN URI. */
export function extractTgnId(uri: string): string | null {
  const match = /vocab\.getty\.edu\/tgn\/(\d+)/.exec(uri);
  return match ? (match[1] ?? null) : null;
}

interface SparqlBinding {
  lat?: { value: string };
  long?: { value: string };
  label?: { value: string };
}

interface SparqlResponse {
  results?: { bindings?: SparqlBinding[] };
}

/** Query Getty's SPARQL endpoint for a TGN place's coordinates + English preferred label. */
export async function fetchTgnPlace(id: string): Promise<ResolvedPlace | null> {
  await rateLimit(TGN_HOST);
  const query = `
    PREFIX wgs84: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT ?lat ?long ?label WHERE {
      <http://vocab.getty.edu/tgn/${id}-place> wgs84:lat ?lat ; wgs84:long ?long .
      OPTIONAL {
        <http://vocab.getty.edu/tgn/${id}> skos:prefLabel ?label .
        FILTER(LANG(?label) = "en")
      }
    }
    LIMIT 1
  `.trim();
  const url = `http://vocab.getty.edu/sparql.json?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TGN ${id}: HTTP ${response.status}`);
  const data = (await response.json()) as SparqlResponse;
  const binding = data.results?.bindings?.[0];
  if (!binding?.lat?.value || !binding?.long?.value) return null;
  const lat = Number.parseFloat(binding.lat.value);
  const lon = Number.parseFloat(binding.long.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: `tgn:${id}`,
    name: binding.label?.value ?? `TGN ${id}`,
    lat,
    lon,
    source: 'getty-tgn',
    uri: `http://vocab.getty.edu/tgn/${id}`,
  };
}
