export type PlaceSource = 'pleiades' | 'getty-tgn' | 'wikidata' | 'manual';

export interface ResolvedPlace {
  id: string; // "pleiades:766" or "tgn:7001319"
  name: string;
  lat: number;
  lon: number;
  source: PlaceSource;
  uri: string;
}

/** Store format for vendored gazetteer JSON files.
 *  Keys are the source-local id (no prefix). Null = known-missing. */
export interface GazetteerStore {
  schema_version: 1;
  generated_at: string;
  source: PlaceSource;
  entries: Record<string, ResolvedPlace | null>;
}
