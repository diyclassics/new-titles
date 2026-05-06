export type PlaceSource = 'pleiades' | 'getty-tgn' | 'wikidata' | 'manual';

export interface ResolvedPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  source: PlaceSource;
  uri: string;
}

export function sourceLabelFor(source: PlaceSource): string {
  switch (source) {
    case 'pleiades':
      return 'Pleiades';
    case 'getty-tgn':
      return 'TGN';
    case 'wikidata':
      return 'Wikidata';
    case 'manual':
      return 'Approx.';
  }
}
