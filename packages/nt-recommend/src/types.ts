/**
 * Contract for scholar-aware geo-based recommendations.
 *
 * Scaffold only — implementation post-launch. The types here define the interface
 * downstream consumers (nt-map personalized view, email digest) will depend on,
 * so they can be sketched against before the engine exists.
 */
import type { Acquisition } from '@nt/data/schema';

export type ScholarId = string;

export interface ScholarProfile {
  id: ScholarId;
  name: string;
  /** Pleiades ids or region names the scholar is interested in. */
  interests: readonly string[];
}

export interface Recommendation {
  acquisition: Acquisition;
  score: number;
  /** Why this was recommended — Pleiades id, region match, proximity, etc. */
  reasons: readonly string[];
}

export interface Recommender {
  recommend(
    scholar: ScholarProfile,
    pool: readonly Acquisition[],
    limit?: number,
  ): readonly Recommendation[];
}
