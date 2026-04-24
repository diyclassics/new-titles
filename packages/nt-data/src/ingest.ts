/**
 * Canonical JSON (from scripts/convert_export.py) → validated acquisitions.json.
 *
 * Takes the Python converter's output, Zod-validates every record, and writes
 * a normalized file into `data/`. Fails loud on any schema violation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { AcquisitionsFileSchema } from './schema.ts';

const args = process.argv.slice(2);
const inputPath = args[0];
if (!inputPath) {
  console.error('usage: tsx src/ingest.ts <canonical.json> [--out <path>]');
  process.exit(2);
}

const outIdx = args.indexOf('--out');
const outOverride = outIdx >= 0 ? args[outIdx + 1] : undefined;
if (outIdx >= 0 && !outOverride) {
  console.error('--out requires a path argument');
  process.exit(2);
}
const outputPath = outOverride ?? join(dirname(inputPath), '..', basename(inputPath));

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const result = AcquisitionsFileSchema.safeParse(raw);

if (!result.success) {
  console.error(`ingest: ${inputPath} failed schema validation`);
  const issues = result.error.issues.slice(0, 10);
  for (const issue of issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  if (result.error.issues.length > 10) {
    console.error(`  …and ${result.error.issues.length - 10} more`);
  }
  process.exit(1);
}

writeFileSync(outputPath, `${JSON.stringify(result.data, null, 2)}\n`);
console.error(`ingested ${result.data.records.length} records → ${outputPath}`);
