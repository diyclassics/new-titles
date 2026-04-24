# nt-map

Public interactive map of recent library acquisitions. **5/15 launch target.**

## Stack

Vite + React 19 + TypeScript + react-leaflet. Reads `@nt/data/acquisitions.json` at build time; no runtime data fetching.

## Commands

```bash
pnpm --filter nt-map dev       # dev server at http://localhost:5173
pnpm --filter nt-map build     # production build → dist/
pnpm --filter nt-map preview   # preview the production build
```

## Deployment

Static site deployed to GitHub Pages via `.github/workflows/deploy-map.yml` on merge to `main`. Pull requests upload the built `dist/` as a CI artifact for manual preview.

Base path is environment-driven — set `VITE_BASE_PATH=/<repo-name>/` for a GH Pages sub-path deploy, leave unset for custom-domain or local.

## Conventions

- Records are parsed through the Zod schema at boot. A corrupt `acquisitions.json` crashes the app loudly rather than silently rendering partial data.
- One marker per (record, place) pair. Records with multiple places produce multiple markers.
- No backend. When per-scholar views arrive post-launch, this app may split into static pre-rendered routes.
