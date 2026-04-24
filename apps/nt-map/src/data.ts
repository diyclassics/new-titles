import { type Acquisition, AcquisitionsFileSchema } from '@nt/data/schema';
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

// Each month is loaded via dynamic import — Vite emits a separate chunk per
// JSON file, so only the active month's data ships on first paint. Additional
// months fetch on demand (and cache in the browser thereafter).
const MONTH_LOADERS: Record<MonthKey, () => Promise<MonthData>> = {
  '2026-01': async () => {
    const [acq, places, cls] = await Promise.all([
      import('@nt/data/acquisitions-2026-01.json'),
      import('@nt/data/places-2026-01.json'),
      import('@nt/data/classifications-2026-01.json'),
    ]);
    return assemble('2026-01', acq.default, places.default, cls.default);
  },
  '2026-02': async () => {
    const [acq, places, cls] = await Promise.all([
      import('@nt/data/acquisitions-2026-02.json'),
      import('@nt/data/places-2026-02.json'),
      import('@nt/data/classifications-2026-02.json'),
    ]);
    return assemble('2026-02', acq.default, places.default, cls.default);
  },
  '2026-03': async () => {
    const [acq, places, cls] = await Promise.all([
      import('@nt/data/acquisitions-2026-03.json'),
      import('@nt/data/places-2026-03.json'),
      import('@nt/data/classifications-2026-03.json'),
    ]);
    return assemble('2026-03', acq.default, places.default, cls.default);
  },
};

function assemble(
  key: MonthKey,
  acquisitions: unknown,
  places: unknown,
  classifications: unknown,
): MonthData {
  const records = AcquisitionsFileSchema.parse(acquisitions).records;
  return {
    key,
    label: MONTH_LABEL[key],
    records,
    placesById: (places as PlacesFile).places,
    classificationsById: (classifications as ClassificationsFile).by_id,
  };
}

// In-memory cache so re-selecting a month after its first load is instant.
const cache = new Map<MonthKey, MonthData>();

export async function loadMonth(key: MonthKey): Promise<MonthData> {
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await MONTH_LOADERS[key]();
  cache.set(key, data);
  return data;
}
