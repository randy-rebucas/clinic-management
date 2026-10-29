/**
 * Loads a production backup into the local Docker database and anonymizes it (scrub.ts).
 * Only runs against a database on this machine (guard.ts). See docs/LOCAL_DEV_DATABASE.md.
 *
 *   pnpm db:local:refresh                          # newest backups/*.zip
 *   pnpm db:local:refresh backups/backup-<t>.zip   # a specific one
 *   pnpm db:local:scrub                            # scrub what's already loaded, no restore
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';
import { assertLocalDatabase, describeMongoUri } from './guard';
import { scrubDatabase, DEV_PASSWORD } from './scrub';

const SCRUB_ONLY = process.argv.includes('--scrub-only');

function run(cmd: string, args: string[], shell = false) {
  // Through a shell, Node wants one command string (args here are fixed, never user input).
  const r = shell
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) throw new Error(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited with code ${r.status}`);
}

function newestBackup(): string {
  const dir = path.resolve(process.cwd(), 'backups');
  const zips = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).sort() : [];
  if (!zips.length) {
    console.error('❌  No backups/*.zip found. Make one from production first: pnpm prod db:backup:zip');
    process.exit(1);
  }
  return path.join(dir, zips[zips.length - 1]);
}

function extract(zip: string, into: string) {
  // Windows' own bsdtar reads zips and C:\ paths; Git Bash's GNU tar does neither.
  if (process.platform === 'win32') run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', into]);
  else run('unzip', ['-q', zip, '-d', into]);
}

/** The folder mongodump wrote, and the database name inside it. */
function findDump(root: string): { dir: string; db: string } {
  for (const top of fs.readdirSync(root)) {
    const dir = path.join(root, top);
    if (!fs.statSync(dir).isDirectory()) continue;
    const dbs = fs.readdirSync(dir).filter((d) => d !== 'admin' && fs.statSync(path.join(dir, d)).isDirectory());
    if (dbs.length === 1) return { dir, db: dbs[0] };
  }
  throw new Error('No mongodump folder with exactly one database found in the backup');
}

async function main() {
  const uri = assertLocalDatabase(process.env.MONGODB_URI);
  const target = new URL(uri.replace(/^mongodb:/, 'http:')).pathname.replace(/^\//, '') || 'test';

  if (!SCRUB_ONLY) {
    const zip = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? newestBackup());
    console.log(`Backup:   ${zip}`);
    console.log(`Target:   ${describeMongoUri(uri)}  (will be replaced)\n`);
    run('docker', ['compose', 'up', '-d', '--wait', 'mongo']);

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-db-'));
    try {
      extract(zip, work);
      const dump = findDump(work);
      const server = uri.replace(/^(mongodb:\/\/[^/?]+).*$/, '$1/');
      run('mongorestore', [
        `--uri=${server}`, '--drop', '--quiet',
        `--nsInclude=${dump.db}.*`, `--nsFrom=${dump.db}.*`, `--nsTo=${target}.*`,
        dump.dir,
      ]);
      console.log('Restored.');
    } finally {
      // The unzipped dump holds real patient data until the scrub below.
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  console.log('\nScrubbing personal data and secrets…');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const { logins, problems } = await scrubDatabase(mongoose.connection.db!);
  await mongoose.disconnect();

  if (problems.length) {
    console.error('\n❌  Self-check found data that still looks real:');
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }
  console.log('\n✅  Self-check clean.');

  // Collections the backup leaves out (backuprecords) have no indexes yet.
  console.log('\nBuilding any missing indexes…');
  // pnpm is a .cmd shim on Windows, which only starts through a shell.
  run('pnpm', ['-s', 'db:indexes', '--apply'], process.platform === 'win32');
  console.log('');
  console.log(`Staff logins (password for all: ${DEV_PASSWORD}). Open http://<clinic>.localhost:3000/login`);
  for (const l of logins) console.log(`  ${l.clinic.padEnd(20)} ${l.role.padEnd(22)} ${l.email}`);
}

main().catch(async (err) => {
  console.error(`❌  ${err instanceof Error ? err.message : err}`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
