# @nt/recommend

Scholar-aware geo-based recommendations.

**Status: post-launch scaffold only.** Only the type contract (`src/types.ts`) is defined, so downstream consumers (personalized map views, email digests) can sketch against a stable interface.

Implementation order: scholar profiles → matching engine → per-scholar views → (much later) email digest and geofenced push.
