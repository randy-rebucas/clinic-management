import { config } from 'dotenv';
import { resolve } from 'path';
import { createWriteStream, mkdirSync, statSync } from 'fs';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Canonical Extended JSON keeps ObjectId/Date/Decimal128/Binary types so a restore
// reproduces the original documents. Use the driver's own BSON to stay version-compatible.
const { EJSON } = mongoose.mongo.BSON;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set in .env.local / .env');
  process.exit(1);
}

// Optional label from CLI: pnpm db:backup my-label
const label = process.argv[2] || '';

function write(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  return new Promise((res, rej) => {
    if (stream.write(chunk)) return res();
    stream.once('drain', res);
    stream.once('error', rej);
  });
}

async function main() {
  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);

  const db = mongoose.connection.db!;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.') && name !== 'backuprecords');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = label
    ? `backup-${label.replace(/[^a-z0-9]/gi, '_')}-${timestamp}.ejson`
    : `backup-${timestamp}.ejson`;

  const outputDir = resolve(process.cwd(), 'backups');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, filename);

  // Streamed so large databases don't have to fit in memory.
  const out = createWriteStream(outputPath, { encoding: 'utf8' });
  const header = {
    timestamp: new Date().toISOString(),
    version: '2.0',
    format: 'ejson-canonical',
    label: label || undefined,
    collections,
  };
  await write(out, `{"meta":${JSON.stringify(header)},"data":{`);

  let totalDocuments = 0;
  for (let i = 0; i < collections.length; i++) {
    const name = collections[i];
    await write(out, `${i ? ',' : ''}${JSON.stringify(name)}:[`);
    let count = 0;
    for await (const doc of db.collection(name).find({})) {
      await write(out, `${count ? ',' : ''}${EJSON.stringify(doc, { relaxed: false })}`);
      count++;
    }
    await write(out, ']');
    totalDocuments += count;
    console.log(`  ✓ ${name} (${count} docs)`);
  }
  await write(out, `},"totalDocuments":${totalDocuments}}`);
  await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));

  const sizeKB = (statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\n✅  Backup written to: ${outputPath}`);
  console.log(`   Collections : ${collections.length}`);
  console.log(`   Documents   : ${totalDocuments}`);
  console.log(`   Size        : ${sizeKB} KB`);
  console.log('\nℹ️   This file contains password hashes and patient data — store it encrypted.');
  console.log('   For production, prefer Atlas snapshots or scripts/backup/backup.sh (mongodump).');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Backup failed:', err);
  process.exit(1);
});
