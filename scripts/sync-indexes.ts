/**
 * Keeps database indexes in line with the schemas. Production runs with autoIndex off
 * (lib/mongodb.ts), so run this after deploying a change that adds or removes an index.
 *
 * By default it only creates missing indexes. With --drop it instead removes indexes that no
 * schema declares. It never drops _id, and leaves unique, TTL and partial indexes alone (they
 * enforce rules or delete data, not just speed up queries) unless named in --allow.
 *
 *   npx tsx scripts/sync-indexes.ts                       # dry run: list missing indexes
 *   npx tsx scripts/sync-indexes.ts --apply               # create them
 *   npx tsx scripts/sync-indexes.ts --drop                # dry run: list undeclared indexes
 *   npx tsx scripts/sync-indexes.ts --drop --apply        # drop them
 *   npx tsx scripts/sync-indexes.ts --drop --apply --allow=coll.indexName,coll.other
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { type Model } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const DROP = process.argv.includes('--drop');
const ALLOW = new Set(
  (process.argv.find((a) => a.startsWith('--allow='))?.slice('--allow='.length) ?? '').split(',').filter(Boolean)
);

async function collectionExists(model: Model<any>): Promise<boolean> {
  const found = await mongoose.connection.db!.listCollections({ name: model.collection.collectionName }).toArray();
  return found.length > 0;
}

async function createMissing(models: Model<any>[]): Promise<number> {
  let missingTotal = 0;
  let failed = 0;
  for (const model of models) {
    const diff = await model.diffIndexes();
    if (!diff.toCreate.length) continue;
    missingTotal += diff.toCreate.length;
    console.log(`${model.modelName}: ${diff.toCreate.length} missing ${diff.toCreate.map((s) => JSON.stringify(s)).join(' ')}`);
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
  return failed;
}

async function dropUndeclared(models: Model<any>[]): Promise<number> {
  let found = 0;
  let held = 0;
  let failed = 0;
  for (const model of models) {
    if (!(await collectionExists(model))) continue;
    const diff = await model.diffIndexes();
    const names = diff.toDrop.filter((n: string) => n !== '_id_');
    if (!names.length) continue;
    const coll = model.collection.collectionName;
    const info = await model.collection.indexes();
    for (const name of names) {
      found++;
      const ix: any = info.find((i: any) => i.name === name) ?? {};
      const kind = [ix.unique && 'unique', ix.expireAfterSeconds !== undefined && 'TTL', ix.partialFilterExpression && 'partial']
        .filter(Boolean)
        .join(', ');
      const label = `${coll}.${name}${kind ? ` [${kind}]` : ''}`;
      if (kind && !ALLOW.has(`${coll}.${name}`)) {
        held++;
        console.log(`  hold  ${label} (pass --allow=${coll}.${name} to drop)`);
        continue;
      }
      if (!APPLY) {
        console.log(`  drop  ${label}`);
        continue;
      }
      try {
        await model.collection.dropIndex(name);
        console.log(`  dropped ${label}`);
      } catch (err: any) {
        failed++;
        console.log(`  x ${label}: ${err?.codeName || err?.code || err?.message}`);
      }
    }
  }
  console.log(found ? `${found} undeclared index(es), ${held} held back${APPLY ? `, ${failed} failed` : ''}` : 'No undeclared indexes.');
  return failed;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  const action = DROP ? 'dropping undeclared indexes' : 'creating indexes';
  console.log(APPLY ? `MODE: APPLY (${action})` : `MODE: DRY RUN (no changes; pass --apply for ${action})`);
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  // Every file in models/, not models/index.ts, which doesn't export them all.
  const modelsDir = path.resolve(process.cwd(), 'models');
  for (const file of fs.readdirSync(modelsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }
  const models = mongoose.modelNames().sort().map((name) => mongoose.model(name));

  const failed = DROP ? await dropUndeclared(models) : await createMissing(models);
  await mongoose.disconnect();
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
