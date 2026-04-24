# nt-website

Monthly standalone HTML fragment of recent acquisitions, for ingestion into work's CMS.

**Status: post-launch.** Significant prior art exists on a previous iteration and will be ported in rather than rebuilt. This scaffold reserves the package slot and documents the planned shape.

## Planned shape

- Node script `src/build-monthly.ts` that reads `@nt/data/acquisitions.json` and (post-nt-classify) `classifications.json`, filters to a target month, and emits a standalone HTML fragment.
- Output: `apps/nt-website/out/<YYYY-MM>.html`.
- Fragment only — no `<html>`, `<head>`, `<body>`. CMS wraps it.
- Inline styles or CMS-tolerated scoped classes. No external CSS.

## Planned command

```bash
pnpm --filter nt-website build -- --month 2026-05
```

## Scheduling

A monthly GitHub Actions cron workflow will run the build and open a PR with the generated fragment attached, so the file is reviewable before handoff.
