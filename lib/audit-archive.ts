/**
 * Moves old audit log entries out of the database into private Vercel Blob files, and deletes
 * those files once they are past retention. Run weekly by the data-retention cron.
 *
 * One file per clinic per calendar month (UTC): gzipped JSON lines in canonical Extended JSON,
 * the same encoding as the database backups, so every entry can be restored exactly. Entries leave
 * the database only after the uploaded file has been downloaded again and matched (checksum and
 * entry count), and only the entries that are in that file. Files are never overwritten.
 */

import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import mongoose, { Types } from 'mongoose';
import { del, get, put } from '@vercel/blob';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import AuditLogArchive, { type IAuditLogArchive } from '@/models/AuditLogArchive';

/** How long entries stay searchable in the app, and how long archive files are kept. */
export const AUDIT_ARCHIVE_DEFAULTS = { keepInDatabaseDays: 90, keepArchiveDays: 5 * 365 + 1 };
/** Floors that caller-supplied policies cannot go below. */
export const MIN_KEEP_IN_DATABASE_DAYS = 30;
export const MIN_KEEP_ARCHIVE_DAYS = 365;
/** Months archived per clinic per run; a backlog is worked off over several weekly runs. */
const MAX_MONTHS_PER_RUN = 12;
const DELETE_BATCH = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const { EJSON } = mongoose.mongo.BSON;

/** True when the app can reach a Blob store (OIDC on Vercel, or a read-write token elsewhere). */
export function isArchiveStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const startOfMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextMonthUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
/** null and missing both mean "no clinic": platform entries. */
const ownerFilter = (tenantId: Types.ObjectId | null) => ({ tenantId: tenantId ?? null });

async function readBlob(pathname: string): Promise<Buffer | null> {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/** Archive one month; returns the number of entries moved out of the database. */
async function archiveMonth(tenantId: Types.ObjectId | null, monthStart: Date): Promise<number> {
  const filter = { ...ownerFilter(tenantId), timestamp: { $gte: monthStart, $lt: nextMonthUtc(monthStart) } };
  const docs = await AuditLog.collection.find(filter).sort({ timestamp: 1, _id: 1 }).toArray();
  if (!docs.length) return 0;

  const body = gzipSync(Buffer.from(docs.map((d) => EJSON.stringify(d, { relaxed: false })).join('\n') + '\n'));
  const checksum = sha256(body);
  const month = monthKey(monthStart);
  const blob = await put(`audit-logs/${tenantId ? String(tenantId) : 'platform'}/${month}.jsonl.gz`, body, {
    access: 'private',
    contentType: 'application/gzip',
    addRandomSuffix: true,
  });

  // Read it back before anything leaves the database.
  const stored = await readBlob(blob.pathname);
  let intact = false;
  if (stored && sha256(stored) === checksum) {
    try {
      intact = gunzipSync(stored).toString('utf8').split('\n').filter(Boolean).length === docs.length;
    } catch {
      intact = false;
    }
  }
  if (!intact) {
    await del(blob.pathname).catch(() => undefined);
    throw new Error(`Archive check failed for ${month}: the stored file does not match what was written`);
  }

  await AuditLogArchive.create({
    tenantId: tenantId ?? undefined,
    month,
    pathname: blob.pathname,
    url: blob.url,
    entries: docs.length,
    bytes: body.length,
    sha256: checksum,
    firstAt: docs[0].timestamp,
    lastAt: docs[docs.length - 1].timestamp,
  });

  const ids = docs.map((d) => d._id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    const res = await AuditLog.collection.deleteMany({ _id: { $in: ids.slice(i, i + DELETE_BATCH) } });
    deleted += res.deletedCount;
  }
  return deleted;
}

/**
 * Move a clinic's audit entries older than `keepInDatabaseDays` (rounded down to whole calendar
 * months, so the newest months stay complete in the app) into archive files.
 * Pass null for platform entries that belong to no clinic.
 */
export async function archiveAuditLogs(
  tenantId: Types.ObjectId | null,
  keepInDatabaseDays: number = AUDIT_ARCHIVE_DEFAULTS.keepInDatabaseDays,
  now: Date = new Date()
): Promise<{ entries: number; files: number }> {
  if (!isArchiveStorageConfigured()) return { entries: 0, files: 0 };
  await connectDB();

  const days = Math.max(MIN_KEEP_IN_DATABASE_DAYS, keepInDatabaseDays);
  const cutoff = startOfMonthUtc(new Date(now.getTime() - days * DAY_MS));
  const oldest = await AuditLog.collection.findOne(
    { ...ownerFilter(tenantId), timestamp: { $lt: cutoff } },
    { sort: { timestamp: 1 }, projection: { timestamp: 1 } }
  );
  if (!oldest) return { entries: 0, files: 0 };

  let entries = 0;
  let files = 0;
  let month = startOfMonthUtc(oldest.timestamp);
  for (let i = 0; i < MAX_MONTHS_PER_RUN && month < cutoff; i++, month = nextMonthUtc(month)) {
    const moved = await archiveMonth(tenantId, month);
    if (moved) {
      entries += moved;
      files++;
    }
  }
  return { entries, files };
}

/** Delete archive files whose month ended more than `keepArchiveDays` ago. Returns files deleted. */
export async function deleteExpiredArchives(
  tenantId: Types.ObjectId | null,
  keepArchiveDays: number = AUDIT_ARCHIVE_DEFAULTS.keepArchiveDays,
  now: Date = new Date()
): Promise<number> {
  if (!isArchiveStorageConfigured()) return 0;
  await connectDB();

  const days = Math.max(MIN_KEEP_ARCHIVE_DAYS, keepArchiveDays);
  // A month is expired once its last day is past the retention period.
  const lastExpiredMonth = monthKey(startOfMonthUtc(new Date(now.getTime() - days * DAY_MS)));
  const expired = await AuditLogArchive.find({ ...ownerFilter(tenantId), month: { $lt: lastExpiredMonth } })
    .select('pathname')
    .lean<Pick<IAuditLogArchive, '_id' | 'pathname'>[]>();
  for (const archive of expired) {
    await del(archive.pathname);
    await AuditLogArchive.deleteOne({ _id: archive._id });
  }
  return expired.length;
}

/** The gzipped file for download, or null when it can't be found. */
export async function readAuditArchive(archive: Pick<IAuditLogArchive, 'pathname'>): Promise<Buffer | null> {
  return readBlob(archive.pathname);
}
