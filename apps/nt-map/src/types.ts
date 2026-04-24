export type PlaceSource = 'pleiades' | 'getty-tgn';

export interface ResolvedPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  source: PlaceSource;
  uri: string;
}
