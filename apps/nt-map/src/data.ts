import { type Acquisition, AcquisitionsFileSchema } from '@nt/data/schema';

import acq01 from '@nt/data/acquisitions-2026-01.json';
import acq02 from '@nt/data/acquisitions-2026-02.json';
import acq03 from '@nt/data/acquisitions-2026-03.json';
import class01 from '@nt/data/classifications-2026-01.json';
import class02 from '@nt/data/classifications-2026-02.json';
import class03 from '@nt/data/classifications-2026-03.json';
import places01 from '@nt/data/places-2026-01.json';
import places02 from '@nt/data/places-2026-02.json';
import places03 from '@nt/data/places-2026-03.json';

import type { ResolvedPlace } from './types.ts';

export const MONTH_KEYS = ['2026-01', '2026-02', '2026-03'] as const;
export type MonthKey = (typeof MONTH_KEYS)[number];

export const MONTH_LABEL: Record<MonthKey, string> = {
  '2026-01': 'January 2026',
  '2026-02': 'February 2026',
  '2026-03': 'March 2026',
};

export const CATEGORIES = [
  'European and Classical Antiquity',
  'Egypt & North Africa',
  'Ancient Western Asia',
  'The Caucasus & The Western Steppe',
  'Central Asia & Siberia',
  'China, South Asia, & East Asia',
  'Cross-Cultural Studies & Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Distinct hues per region. Ordered to match CATEGORIES. */
export const CATEGORY_COLOR: Record<Category, string> = {
  'European and Classical Antiquity': '#1f77b4', // blue
  'Egypt & North Africa': '#ff7f0e', // orange
  'Ancient Western Asia': '#d62728', // red
  'The Caucasus & The Western Steppe': '#9467bd', // purple
  'Central Asia & Siberia': '#8c564b', // brown
  'China, South Asia, & East Asia': '#2ca02c', // green
  'Cross-Cultural Studies & Other': '#7f7f7f', // gray
};

export type PlacesFile = {
  places: Record<string, ResolvedPlace>;
};

export type ClassificationsFile = {
  by_id: Record<string, Category>;
};

export interface MonthData {
  key: MonthKey;
  label: string;
  records: Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
}

const rawByMonth: Record<
  MonthKey,
  {
    acquisitions: unknown;
    places: PlacesFile;
    classifications: ClassificationsFile;
  }
> = {
  '2026-01': {
    acquisitions: acq01,
    places: places01 as PlacesFile,
    classifications: class01 as ClassificationsFile,
  },
  '2026-02': {
    acquisitions: acq02,
    places: places02 as PlacesFile,
    classifications: class02 as ClassificationsFile,
  },
  '2026-03': {
    acquisitions: acq03,
    places: places03 as PlacesFile,
    classifications: class03 as ClassificationsFile,
  },
};

export function loadMonth(key: MonthKey): MonthData {
  const raw = rawByMonth[key];
  const records = AcquisitionsFileSchema.parse(raw.acquisitions).records;
  return {
    key,
    label: MONTH_LABEL[key],
    records,
    placesById: raw.places.places,
    classificationsById: raw.classifications.by_id,
  };
}
