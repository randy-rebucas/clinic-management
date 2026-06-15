import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import mongoose from 'mongoose';
import readline from 'readline';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set in .env.local / .env');
  process.exit(1);
}

// Path to backup file: pnpm db:restore backups/backup-2026-01-01T00-00-00-000Z.json
const filePath = process.argv[2];
if (!filePath) {
  console.error('❌  Usage: pnpm db:restore <path-to-backup-file>');
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
  let backup: any;
  try {
    backup = JSON.parse(raw);
  } catch {
    console.error('❌  Could not parse JSON from backup file.');
    process.exit(1);
  }

  if (!backup.data || typeof backup.data !== 'object') {
    console.error('❌  Invalid backup format — missing "data" field.');
    process.exit(1);
  }

  console.log('\n📦  Backup file info:');
  console.log(`   File        : ${absolutePath}`);
  console.log(`   Timestamp   : ${backup.timestamp ?? 'unknown'}`);
  console.log(`   Label       : ${backup.label ?? '(none)'}`);
  console.log(`   Collections : ${(backup.collections ?? []).join(', ')}`);
  console.log(`   Documents   : ${backup.totalDocuments ?? '?'}`);

  const answer = await question(
    '\n⚠️   This will OVERWRITE all current data. Type "yes" to continue: '
  );
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\n🔌  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);

  const db = mongoose.connection.db!;
  const results: Record<string, { inserted: number; errors: number }> = {};

  for (const [collectionName, documents] of Object.entries(
    backup.data as Record<string, unknown[]>
  )) {
    if (collectionName === 'backuprecords') continue; // never wipe backup history

    try {
      const col = db.collection(collectionName);
      await col.deleteMany({});

      if (Array.isArray(documents) && documents.length > 0) {
        await col.insertMany(documents as any[], { ordered: false });
        results[collectionName] = { inserted: documents.length, errors: 0 };
      } else {
        results[collectionName] = { inserted: 0, errors: 0 };
      }
      console.log(`  ✓ ${collectionName} — ${results[collectionName].inserted} docs restored`);
    } catch (err: any) {
      results[collectionName] = { inserted: 0, errors: 1 };
      console.error(`  ✗ ${collectionName} — ${err.message}`);
    }
  }

  const errorCount = Object.values(results).filter((r) => r.errors > 0).length;
  if (errorCount > 0) {
    console.log(`\n⚠️   Restore completed with errors in ${errorCount} collection(s).`);
  } else {
    console.log('\n✅  Restore completed successfully.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Restore failed:', err);
  process.exit(1);
});
