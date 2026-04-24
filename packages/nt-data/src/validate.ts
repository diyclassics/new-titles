import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AcquisitionsFileSchema } from './schema.ts';

const ACQUISITIONS_PATH = join(import.meta.dirname, '..', 'data', 'acquisitions.json');

const raw = JSON.parse(readFileSync(ACQUISITIONS_PATH, 'utf8'));
const result = AcquisitionsFileSchema.safeParse(raw);

if (!result.success) {
  console.error('acquisitions.json failed schema validation:\n');
  console.error(result.error.format());
  process.exit(1);
}

console.log(`acquisitions.json ok — ${result.data.records.length} records`);
