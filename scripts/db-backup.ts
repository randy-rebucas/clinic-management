import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set in .env.local / .env');
  process.exit(1);
}

// Optional label from CLI: pnpm db:backup my-label
const label = process.argv[2] || '';

async function main() {
  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);

  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();

  const backupData: Record<string, unknown[]> = {};
  let totalDocuments = 0;

  for (const col of collections) {
    if (col.name.startsWith('system.') || col.name === 'backuprecords') continue;

    const docs = await db.collection(col.name).find({}).toArray();
    backupData[col.name] = docs;
    totalDocuments += docs.length;
    console.log(`  ✓ ${col.name} (${docs.length} docs)`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = label
    ? `backup-${label.replace(/[^a-z0-9]/gi, '_')}-${timestamp}.json`
    : `backup-${timestamp}.json`;

  const outputDir = resolve(process.cwd(), 'backups');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, filename);

  const payload = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    label: label || undefined,
    collections: Object.keys(backupData),
    totalDocuments,
    data: backupData,
  };

  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  const sizeKB = (Buffer.byteLength(JSON.stringify(payload), 'utf8') / 1024).toFixed(1);
  console.log(`\n✅  Backup written to: ${outputPath}`);
  console.log(`   Collections : ${payload.collections.length}`);
  console.log(`   Documents   : ${totalDocuments}`);
  console.log(`   Size        : ${sizeKB} KB`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Backup failed:', err);
  process.exit(1);
});
