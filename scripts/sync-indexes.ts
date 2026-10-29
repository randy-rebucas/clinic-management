/**
 * Builds the indexes every schema declares. Production runs with autoIndex off (lib/mongodb.ts),
 * so run this after deploying a change that adds an index, and once after first turning it off.
 *
 * Only creates; never drops an index. Indexes already present are left as they are.
 *
 *   npx tsx scripts/sync-indexes.ts            # dry run (default): list missing indexes
 *   npx tsx scripts/sync-indexes.ts --apply    # create them
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (creating indexes)' : 'MODE: DRY RUN (no changes; pass --apply to create)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  // Every file in models/, not models/index.ts, which doesn't export them all.
  const modelsDir = path.resolve(process.cwd(), 'models');
  for (const file of fs.readdirSync(modelsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }

  let missingTotal = 0;
  let failed = 0;
  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);
    const diff = await model.diffIndexes();
    if (!diff.toCreate.length) continue;
    missingTotal += diff.toCreate.length;
    console.log(`${name}: ${diff.toCreate.length} missing ${diff.toCreate.map((s) => JSON.stringify(s)).join(' ')}`);
    if (!APPLY) continue;
    try {
      await model.createCollection().catch(() => undefined);
      await model.createIndexes();
      console.log('  created');
    } catch (err: any) {
      failed++;
      console.log(`  x ${err?.codeName || err?.code || err?.message}`);
    }
  }

  console.log(missingTotal ? `${missingTotal} missing index(es)${APPLY ? `, ${failed} model(s) failed` : ''}` : 'All indexes present.');
  await mongoose.disconnect();
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
