/**
 * Persistent Mongo ObjectId -> Postgres UUID mapping.
 *
 * Backed by a `_migration_id_map` table so the mapping survives across
 * script runs (reruns are resumable/idempotent). An in-memory cache sits in
 * front of it to avoid a round trip on every lookup within a single run.
 *
 * Usage:
 *   await ensureIdMapTable();
 *   const pgId = await getOrCreateId('Patient', mongoDoc._id.toString());
 *   const refId = await lookupId('Patient', someOtherDoc.patientId.toString());
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';

let tableEnsured = false;

// collection -> mongoId -> postgresId
const cache = new Map<string, Map<string, string>>();

// Per-key in-flight promises so concurrent getOrCreateId() calls for the same
// (collection, mongoId) don't race to insert two different UUIDs.
const inFlight = new Map<string, Promise<string>>();

function cacheGet(collection: string, mongoId: string): string | undefined {
  return cache.get(collection)?.get(mongoId);
}

function cacheSet(collection: string, mongoId: string, postgresId: string): void {
  let inner = cache.get(collection);
  if (!inner) {
    inner = new Map();
    cache.set(collection, inner);
  }
  inner.set(mongoId, postgresId);
}

/**
 * Create the `_migration_id_map` table if it doesn't already exist. Safe to
 * call repeatedly (idempotent, cheap after the first call in a process).
 */
export async function ensureIdMapTable(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _migration_id_map (
      collection  text NOT NULL,
      mongo_id    text NOT NULL,
      postgres_id uuid NOT NULL,
      PRIMARY KEY (collection, mongo_id)
    )
  `);
  tableEnsured = true;
}

/**
 * Look up an existing mapping, or create+persist a new one. Safe under
 * concurrent calls for the same (collection, mongoId) key: the in-memory
 * cache dedupes within a process, and the DB upsert (`ON CONFLICT DO
 * NOTHING` + re-read) makes reruns / multi-process races idempotent too.
 */
export async function getOrCreateId(collection: string, mongoId: string): Promise<string> {
  await ensureIdMapTable();

  const cached = cacheGet(collection, mongoId);
  if (cached) return cached;

  const key = `${collection}::${mongoId}`;
  const existingInFlight = inFlight.get(key);
  if (existingInFlight) return existingInFlight;

  const promise = (async () => {
    // Re-check cache in case another in-flight call just finished.
    const cachedAgain = cacheGet(collection, mongoId);
    if (cachedAgain) return cachedAgain;

    // Try to read an existing row first (covers reruns of the script where
    // a previous run already persisted this mapping).
    const existingRows = await prisma.$queryRawUnsafe<{ postgres_id: string }[]>(
      `SELECT postgres_id FROM _migration_id_map WHERE collection = $1 AND mongo_id = $2`,
      collection,
      mongoId
    );
    if (existingRows.length > 0) {
      const id = existingRows[0].postgres_id;
      cacheSet(collection, mongoId, id);
      return id;
    }

    // Not found: generate a new UUID and persist it. ON CONFLICT DO NOTHING
    // handles the race where a concurrent process inserted the same key
    // between our SELECT and this INSERT; we then re-read the winning row.
    const newId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO _migration_id_map (collection, mongo_id, postgres_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection, mongo_id) DO NOTHING`,
      collection,
      mongoId,
      newId
    );

    const finalRows = await prisma.$queryRawUnsafe<{ postgres_id: string }[]>(
      `SELECT postgres_id FROM _migration_id_map WHERE collection = $1 AND mongo_id = $2`,
      collection,
      mongoId
    );
    const finalId = finalRows[0]?.postgres_id ?? newId;
    cacheSet(collection, mongoId, finalId);
    return finalId;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Read-only lookup for resolving a ref that MUST already have been
 * migrated. Throws a descriptive error if not found — that indicates a
 * dependency-ordering bug in migrate.ts (the referenced collection should
 * have been migrated earlier).
 */
export async function lookupId(collection: string, mongoId: string): Promise<string | null> {
  await ensureIdMapTable();

  const cached = cacheGet(collection, mongoId);
  if (cached) return cached;

  const rows = await prisma.$queryRawUnsafe<{ postgres_id: string }[]>(
    `SELECT postgres_id FROM _migration_id_map WHERE collection = $1 AND mongo_id = $2`,
    collection,
    mongoId
  );
  if (rows.length === 0) return null;

  const id = rows[0].postgres_id;
  cacheSet(collection, mongoId, id);
  return id;
}

/**
 * Same as lookupId, but throws instead of returning null. Use this for refs
 * that are known to be required (dependency-ordering bugs should be loud).
 */
export async function requireLookupId(collection: string, mongoId: string, context: string): Promise<string> {
  const id = await lookupId(collection, mongoId);
  if (!id) {
    throw new Error(
      `[id-map] Missing mapping for ${collection}:${mongoId} while migrating ${context}. ` +
        `This indicates a dependency-ordering bug — ${collection} must be migrated before ${context}.`
    );
  }
  return id;
}

/** Count how many mappings exist for a collection — used by validate.ts. */
export async function countMappings(collection: string): Promise<number> {
  await ensureIdMapTable();
  const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text as count FROM _migration_id_map WHERE collection = $1`,
    collection
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

/** Sample up to `n` random (mongo_id, postgres_id) pairs for a collection — used by validate.ts. */
export async function sampleMappings(
  collection: string,
  n: number
): Promise<{ mongo_id: string; postgres_id: string }[]> {
  await ensureIdMapTable();
  return prisma.$queryRawUnsafe<{ mongo_id: string; postgres_id: string }[]>(
    `SELECT mongo_id, postgres_id FROM _migration_id_map WHERE collection = $1 ORDER BY random() LIMIT $2`,
    collection,
    n
  );
}
