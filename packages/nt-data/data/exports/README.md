# data/exports/

Landing zone for librarian shelflist exports (CSV/JSON).

## Not committed

Contents of this directory are **gitignored** (see the repo root `.gitignore`). Only `.gitkeep` and this README are tracked. Shelflists stay local — the librarian's system is the source of truth, and `acquisitions.json` (in the parent `data/` directory) is the committed derivative the apps consume.

## Workflow

1. Librarian sends a shelflist export. Save it here with a descriptive filename, e.g. `2026-05-shelflist.csv`.
2. Run `pnpm --filter @nt/data ingest data/exports/<filename>`. This parses, resolves Pleiades IDs, and writes `data/acquisitions.json`.
3. Commit the resulting `acquisitions.json` (and any gazetteer updates). The export itself stays local.

## If you need to share or back up exports

Use an institutional store (shared Drive, Box, OneDrive) rather than git. Name consistently (`YYYY-MM-shelflist.<ext>`) so the provenance is reconstructable even without git history.
