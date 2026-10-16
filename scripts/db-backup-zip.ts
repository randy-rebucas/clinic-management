import { config } from 'dotenv';
import { resolve, join } from 'path';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Full mongodump of the database, zipped: pnpm db:backup:zip [label]
// Restore: unzip, then `mongorestore --uri=<uri> <unzipped folder>` (see docs/BACKUP_RESTORE.md).

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set in .env.local / .env');
  process.exit(1);
}

const label = process.argv[2] || '';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const name = label ? `backup-${label.replace(/[^a-z0-9]/gi, '_')}-${timestamp}` : `backup-${timestamp}`;

const outputDir = resolve(process.cwd(), 'backups');
mkdirSync(outputDir, { recursive: true });
const zipPath = join(outputDir, `${name}.zip`);

const work = mkdtempSync(join(tmpdir(), 'db-backup-'));
const dumpDir = join(work, name);

function run(cmd: string, args: string[], cwd?: string) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited with code ${r.status}`);
}

try {
  // The URI goes in a config file, not argv, so the credentials don't show in the process list.
  const cfg = join(work, 'mongodump.yaml');
  writeFileSync(cfg, `uri: ${JSON.stringify(MONGODB_URI)}\n`, { mode: 0o600 });

  console.log('📦  Dumping database…');
  run('mongodump', [`--config=${cfg}`, `--out=${dumpDir}`, '--excludeCollection=backuprecords']);

  console.log('🗜️   Zipping…');
  // bsdtar (Windows 10+, macOS) writes zip with -a; elsewhere fall back to Info-ZIP.
  if (process.platform === 'linux') run('zip', ['-rq', zipPath, name], work);
  else run('tar', ['-a', '-c', '-f', zipPath, name], work);

  const sizeMB = (statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅  Backup written to: ${zipPath} (${sizeMB} MB)`);
  console.log('ℹ️   Contains password hashes and patient data — store it encrypted.');
} catch (err) {
  console.error('❌  Backup failed:', err instanceof Error ? err.message : err);
  if (/ENOENT/.test(String(err))) console.error('   Install MongoDB Database Tools (mongodump) and make sure it is on PATH.');
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
