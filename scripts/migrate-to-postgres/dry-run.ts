/**
 * Dry-run wrapper for the Phase 3 migration: runs migrate.ts's main() against
 * a scratch/staging Postgres database instead of production, so the full
 * transform+load pipeline can be exercised safely before the real cutover.
 *
 * Refuses to run unless STAGING_DATABASE_URL is set — this is the only
 * guard against accidentally hitting production, so don't remove it.
 *
 * Usage:
 *   STAGING_DATABASE_URL=postgres://... tsx scripts/migrate-to-postgres/dry-run.ts
 *   STAGING_DATABASE_URL=postgres://... tsx scripts/migrate-to-postgres/dry-run.ts --only=Patient
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const stagingUrl = process.env.STAGING_DATABASE_URL;

if (!stagingUrl) {
  console.error(
    '[dry-run] Refusing to run: STAGING_DATABASE_URL is not set.\n' +
      '[dry-run] This safeguard prevents an accidental write against production.\n' +
      '[dry-run] Set STAGING_DATABASE_URL to a scratch Postgres instance and re-run.'
  );
  process.exit(1);
}

// Point DATABASE_URL at staging BEFORE lib/prisma.ts (imported transitively by migrate.ts)
// reads it to construct the Prisma client / pg adapter connection pool.
process.env.DATABASE_URL = stagingUrl;

console.log('='.repeat(72));
console.log('  DRY RUN AGAINST STAGING');
console.log(`  DATABASE_URL -> ${maskConnectionString(stagingUrl)}`);
console.log('  (production MONGODB_URI is still used as the READ source)');
console.log('='.repeat(72));

function maskConnectionString(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(unparseable connection string)';
  }
}

async function run() {
  // Import lazily, after DATABASE_URL has been overridden above, so lib/prisma.ts's
  // module-level createPrismaClient() picks up the staging connection string.
  const { main } = await import('./migrate');
  const mongoose = (await import('mongoose')).default;
  const { prisma } = await import('../../lib/prisma');

  try {
    await main();
    console.log('\n[dry-run] Completed successfully against STAGING.');
  } finally {
    await mongoose.connection.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[dry-run] FATAL:', err);
    process.exit(1);
  });
