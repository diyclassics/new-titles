# new-titles

Library new-acquisitions discovery for a scholarly community: ingest, classify, map, deliver.

The flagship deliverable is **[nt-map](apps/nt-map/)**, an interactive map of recent ISAW Library acquisitions deployed to GitHub Pages. Sibling packages handle data ingest, classification, and the monthly CMS-ready HTML fragment that has historically lived on the ISAW website.

## Repository layout

```
apps/
  nt-map/         Interactive map (Vite + React + react-leaflet) — public deliverable
  nt-website/     Monthly standalone HTML fragment for the CMS (post-launch)
packages/
  nt-data/        Zod schemas, gazetteer, ingest pipeline; canonical acquisitions.json
  nt-classify/    Region classifier (Python + scikit-learn, post-launch)
  nt-recommend/   Scholar-aware recommendations (post-launch, types only today)
docs/
  plans/          Design notes
.github/workflows/
  ci.yml          Lint, typecheck, validate, build (PRs and main)
  deploy-map.yml  Build nt-map → GitHub Pages on push to main
```

Each app/package has its own `README.md` with details specific to that workspace.

## Stack

- **Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`); Node ≥ 22, pnpm ≥ 10.
- **TypeScript everywhere except `nt-classify`** (Python 3.12 + `uv`). One Python package, the rest TypeScript.
- **Tooling:** [Biome](https://biomejs.dev/) for lint + format (`biome.json`), shared `tsconfig.base.json`, project-wide TS strict mode.
- **Schemas:** [Zod](https://zod.dev/) — `acquisitions.json` is parsed at app boot; corrupt data fails loudly rather than rendering partial state.
- **Map app (`nt-map`):** Vite 6, React 19, react-leaflet 5, `leaflet.markercluster`. AWMC/CAWM ancient-world basemap by default (configurable via env). URL hash drives view, month, selected record, search, and category filters — every visible state is shareable.
- **Data (`nt-data`):** ingest is currently stubbed; vendored Pleiades subset acts as the gazetteer.
- **CI:** lint (Biome) + typecheck (`tsc`) + Zod-validate `acquisitions.json` + build, plus Python lint/test once `nt-classify` lands.
- **Deploy:** GH Pages via `actions/deploy-pages` from `apps/nt-map/dist`. Pages rebuild automatically on every push to `main`.

## Setup

You need Node ≥ 22, pnpm ≥ 10, and (for `nt-classify`, post-launch) [`uv`](https://github.com/astral-sh/uv).

```bash
pnpm install
```

That installs everything across the workspace. Subsequent commands are `pnpm` filters that target individual packages.

## Common commands

Run from the repo root:

```bash
pnpm dev:map           # nt-map dev server → http://localhost:5173
pnpm build             # build every package
pnpm typecheck         # tsc --noEmit across the workspace
pnpm lint              # Biome check on the whole repo
pnpm format            # Biome format --write
pnpm validate          # Zod-validate packages/nt-data/acquisitions.json (CI gate)
pnpm test              # run tests across the workspace (most are stubs today)
```

To target a single package:

```bash
pnpm --filter nt-map dev
pnpm --filter nt-map build
pnpm --filter @nt/data validate
```

## Map app at a glance

`apps/nt-map` reads `@nt/data/acquisitions-YYYY-MM.json` (one chunk per month, code-split by Vite) and renders a clustered Leaflet map. Selection, view (map/list), month, search query, and category filter all live in the URL hash, so:

- Sharing a URL preserves the exact view including a deep-linked marker.
- Browser back/forward navigates state history.
- Mobile users get a full-screen list ↔ map toggle; the same URL semantics apply.

For implementation details see `apps/nt-map/README.md`.

## Deployment

`nt-map` is the only currently-deployed surface. `.github/workflows/deploy-map.yml` builds the app on every push to `main` and publishes `apps/nt-map/dist` to GitHub Pages. The site is reachable at the repo's GH Pages URL; the Vite base path is set automatically by the workflow.

`nt-website` (monthly HTML fragment) and `nt-classify` (region classifier) are post-launch.

## Data flow

```
librarian export (CSV / JSON)
        ↓                     packages/nt-data/data/exports/  (gitignored)
   nt-data ingest
        ↓
acquisitions-YYYY-MM.json     ← canonical record set; consumed by all apps
        ↓
   nt-classify predict        (post-launch)
        ↓
classifications-YYYY-MM.json  ← keyed by acquisition id; sibling file, never merged in
        ↓
   nt-map (browser)           ← lazy-loads month data on demand
   nt-website (build script)  ← emits monthly HTML fragment (post-launch)
```

Shelflist exports under `packages/nt-data/data/exports/` are local-only — the librarian's catalog system is the source of truth.

## Conventions

- **Inclusive terminology:** allowlist/blocklist, not whitelist/blacklist.
- **Branch per session:** work happens on a descriptive branch, merged to `main` when stable.
- **No backend:** everything is built artifacts + a static frontend. New per-scholar surfaces post-launch will be served as static pre-rendered routes.
- **Commit style:** one logical change per commit, terse subject lines, body for the *why* when it isn't obvious from the diff.

## Where to look next

- `apps/nt-map/README.md` — map app specifics (env vars, base path, deploy)
- `packages/nt-data/README.md` — schemas, gazetteer, ingest
- `packages/nt-classify/README.md` — classifier plan
- `apps/nt-website/README.md` — monthly fragment plan
- `docs/plans/` — design notes and longer-form thinking
