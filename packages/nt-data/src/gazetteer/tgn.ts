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
  gvpLabel?: { value: string };
  prefEn?: { value: string };
  prefAny?: { value: string };
}

interface SparqlResponse {
  results?: { bindings?: SparqlBinding[] };
}

/**
 * Query Getty's SPARQL endpoint for a TGN place's coordinates + label.
 *
 * Label preference: GVP-canonical (`gvp:prefLabelGVP/gvp:term`) > English-tagged
 * `skos:prefLabel` > any `skos:prefLabel`. Many non-Western places carry the
 * GVP form (e.g. "Baoji") under a non-English language tag like
 * `zh-latn-pinyin-x-notone`, so a strict `@en` filter would miss them.
 */
export async function fetchTgnPlace(id: string): Promise<ResolvedPlace | null> {
  await rateLimit(TGN_HOST);
  const query = `
    PREFIX wgs84: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX gvp: <http://vocab.getty.edu/ontology#>
    SELECT ?lat ?long ?gvpLabel ?prefEn ?prefAny WHERE {
      <http://vocab.getty.edu/tgn/${id}-place> wgs84:lat ?lat ; wgs84:long ?long .
      OPTIONAL { <http://vocab.getty.edu/tgn/${id}> gvp:prefLabelGVP/gvp:term ?gvpLabel . }
      OPTIONAL { <http://vocab.getty.edu/tgn/${id}> skos:prefLabel ?prefEn . FILTER(LANG(?prefEn) = "en") }
      OPTIONAL { <http://vocab.getty.edu/tgn/${id}> skos:prefLabel ?prefAny . }
    }
    LIMIT 1
  `.trim();
  const url = `https://vocab.getty.edu/sparql.json?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TGN ${id}: HTTP ${response.status}`);
  const data = (await response.json()) as SparqlResponse;
  const binding = data.results?.bindings?.[0];
  if (!binding?.lat?.value || !binding?.long?.value) return null;
  const lat = Number.parseFloat(binding.lat.value);
  const lon = Number.parseFloat(binding.long.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label =
    binding.gvpLabel?.value ?? binding.prefEn?.value ?? binding.prefAny?.value ?? `TGN ${id}`;
  return {
    id: `tgn:${id}`,
    name: label,
    lat,
    lon,
    source: 'getty-tgn',
    uri: tgnVowUrl(id),
  };
}

/** Getty Vocabulary Online full-display URL for a TGN id. */
export function tgnVowUrl(id: string): string {
  const params = new URLSearchParams({
    find: id,
    place: '',
    nation: '',
    prev_page: '1',
    english: 'Y',
    subjectid: id,
  });
  return `https://www.getty.edu/vow/TGNFullDisplay?${params.toString()}`;
}
