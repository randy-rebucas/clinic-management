import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import mongoose from 'mongoose';
import readline from 'readline';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Must match db-backup.ts: canonical EJSON restores ObjectId/Date/etc. as real BSON types.
const { EJSON } = mongoose.mongo.BSON;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set in .env.local / .env');
  process.exit(1);
}

// Usage: pnpm db:restore backups/backup-<timestamp>.ejson --confirm
const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--confirm');
if (!filePath) {
  console.error('❌  Usage: pnpm db:restore <path-to-backup-file> --confirm');
  console.error('   For production restores prefer Atlas snapshots or scripts/backup/restore.sh (mongorestore).');
  process.exit(1);
}

const absolutePath = resolve(process.cwd(), filePath);
if (!existsSync(absolutePath)) {
  console.error(`❌  File not found: ${absolutePath}`);
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(q: string): Promise<string> {
  return new Promise((res) => rl.question(q, res));
}

async function main() {
  const raw = readFileSync(absolutePath, 'utf8');

  // Parse and validate the whole file before touching the database.
  let backup: any;
  try {
    backup = EJSON.parse(raw, { relaxed: false });
  } catch {
    console.error('❌  Could not parse Extended JSON from backup file.');
    process.exit(1);
  }

  const meta = backup?.meta;
  if (!meta || meta.format !== 'ejson-canonical' || !backup.data || typeof backup.data !== 'object') {
    console.error('❌  Unsupported backup format. Only backups written by the current db-backup.ts');
    console.error('   (version 2.0, canonical EJSON) can be restored: older plain-JSON backups lost');
    console.error('   ObjectId/Date types and would corrupt the database.');
    process.exit(1);
  }

  const entries = Object.entries(backup.data as Record<string, unknown>).filter(
    ([name]) => name !== 'backuprecords' && !name.startsWith('system.')
  );
  for (const [name, docs] of entries) {
    if (!Array.isArray(docs)) {
      console.error(`❌  Collection "${name}" is not an array in the backup file.`);
      process.exit(1);
    }
  }

  console.log('\n📦  Backup file info:');
  console.log(`   File        : ${absolutePath}`);
  console.log(`   Timestamp   : ${meta.timestamp ?? 'unknown'}`);
  console.log(`   Label       : ${meta.label ?? '(none)'}`);
  console.log(`   Collections : ${entries.map(([n]) => n).join(', ')}`);
  console.log(`   Documents   : ${backup.totalDocuments ?? '?'}`);

  if (!confirmed) {
    rl.close();
    console.error('\n❌  Refusing to restore without --confirm.');
    process.exit(1);
  }

  const answer = await question(
    '\n⚠️   This will REPLACE the listed collections. Type "yes" to continue: '
  );
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\n🔌  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);

  const db = mongoose.connection.db!;
  const suffix = `__restore_${Date.now()}`;
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
  );
  const staged: Array<{ name: string; tmp: string; count: number }> = [];

  // Phase 1: load every collection into a temporary collection. Nothing live is touched yet.
  try {
    for (const [name, docs] of entries as Array<[string, any[]]>) {
      const tmp = `${name}${suffix}`;
      const tmpCol = db.collection(tmp);
      if (docs.length > 0) {
        for (let i = 0; i < docs.length; i += 1000) {
          await tmpCol.insertMany(docs.slice(i, i + 1000), { ordered: true });
        }
      } else {
        await db.createCollection(tmp);
      }

      // Recreate the live collection's indexes so unique constraints are verified before the swap.
      if (existing.has(name)) {
        const indexes = await db.collection(name).indexes();
        const specs = indexes
          .filter((ix) => ix.name !== '_id_')
          .map(({ v: _v, ns: _ns, ...spec }: any) => spec);
        if (specs.length) await tmpCol.createIndexes(specs);
      }

      staged.push({ name, tmp, count: docs.length });
      console.log(`  ✓ staged ${name} (${docs.length} docs)`);
    }
  } catch (err) {
    console.error('\n❌  Staging failed — live data was NOT modified. Cleaning up temporary collections…', err);
    for (const name of entries.map(([n]) => `${n}${suffix}`)) {
      await db.collection(name).drop().catch(() => undefined);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  // Phase 2: swap each staged collection into place (rename is atomic per collection).
  let failures = 0;
  for (const { name, tmp, count } of staged) {
    try {
      await db.renameCollection(tmp, name, { dropTarget: true });
      console.log(`  ✓ ${name} — ${count} docs restored`);
    } catch (err: any) {
      failures++;
      console.error(`  ✗ ${name} — swap failed (staged copy kept as ${tmp}):`, err?.message);
    }
  }

  if (failures > 0) {
    console.log(`\n⚠️   Restore completed with ${failures} failed swap(s); see staged collections above.`);
  } else {
    console.log('\n✅  Restore completed successfully.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Restore failed:', err);
  process.exit(1);
});
