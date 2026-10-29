import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gunzipSync } from 'zlib';
import { Types } from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock('@/models/AuditLog', () => ({
  default: { collection: { find: vi.fn(), findOne: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock('@/models/AuditLogArchive', () => ({
  default: { create: vi.fn(), find: vi.fn(), deleteOne: vi.fn() },
}));

import { put, get, del } from '@vercel/blob';
import AuditLog from '@/models/AuditLog';
import AuditLogArchive from '@/models/AuditLogArchive';
import { archiveAuditLogs, deleteExpiredArchives } from '@/lib/audit-archive';

const DAY = 24 * 60 * 60 * 1000;
const tenantId = new Types.ObjectId();
const now = new Date('2026-10-29T00:00:00Z');

const entry = (iso: string) => ({ _id: new Types.ObjectId(), tenantId, action: 'read', resource: 'patient', timestamp: new Date(iso) });

/** find(filter).sort().toArray() returns entries only for the month the filter asks about. */
function mockMonths(entries: ReturnType<typeof entry>[]) {
  vi.mocked(AuditLog.collection.find).mockImplementation(((filter: any) => ({
    sort: () => ({
      toArray: async () => entries.filter((e) => e.timestamp >= filter.timestamp.$gte && e.timestamp < filter.timestamp.$lt),
    }),
  })) as any);
  vi.mocked(AuditLog.collection.findOne).mockResolvedValue(entries[0] ?? null);
}

/** The Blob store returns exactly what was uploaded (or `tamper` of it). */
function mockStore(tamper: (body: Buffer) => Buffer = (b) => b) {
  const stored = new Map<string, Buffer>();
  vi.mocked(put).mockImplementation((async (pathname: string, body: Buffer) => {
    const name = pathname.replace('.jsonl.gz', '-abc.jsonl.gz');
    stored.set(name, tamper(body));
    return { pathname: name, url: `https://blob.test/${name}` };
  }) as any);
  vi.mocked(get).mockImplementation((async (pathname: string) => ({
    statusCode: 200,
    stream: new Response(new Uint8Array(stored.get(pathname)!)).body,
  })) as any);
  return stored;
}

describe('archiveAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    vi.mocked(del).mockResolvedValue(undefined);
    vi.mocked(AuditLog.collection.deleteMany).mockImplementation((async (f: any) => ({ deletedCount: f._id.$in.length })) as any);
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('archives whole months older than the window and deletes only the archived entries', async () => {
    const june = [entry('2026-06-03T10:00:00Z'), entry('2026-06-28T10:00:00Z')];
    const july = [entry('2026-07-15T10:00:00Z')]; // July isn't over 90 days old as a whole month
    const recent = [entry('2026-08-20T10:00:00Z')];
    mockMonths([...june, ...july, ...recent]);
    const stored = mockStore();

    const result = await archiveAuditLogs(tenantId, 90, now);

    // 90 days before Oct 29 is Jul 31, so whole months before July are archived: June only.
    expect(result).toEqual({ entries: 2, files: 1 });
    const [file] = [...stored.values()];
    expect(gunzipSync(file).toString('utf8').trim().split('\n')).toHaveLength(2);
    expect(AuditLogArchive.create).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-06', entries: 2, tenantId }));
    const deletedIds = vi.mocked(AuditLog.collection.deleteMany).mock.calls.flatMap((c: any) => c[0]._id.$in.map(String));
    expect(deletedIds.sort()).toEqual(june.map((e) => String(e._id)).sort());
  });

  it('deletes nothing when the stored file does not match what was written', async () => {
    mockMonths([entry('2026-05-10T10:00:00Z')]);
    mockStore((b) => Buffer.concat([b, Buffer.from('x')]));

    await expect(archiveAuditLogs(tenantId, 90, now)).rejects.toThrow(/Archive check failed/);
    expect(AuditLog.collection.deleteMany).not.toHaveBeenCalled();
    expect(AuditLogArchive.create).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
  });

  it('does nothing without a Blob store', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const result = await archiveAuditLogs(tenantId, 90, now);
    expect(result).toEqual({ entries: 0, files: 0 });
    expect(AuditLog.collection.findOne).not.toHaveBeenCalled();
  });

  it('keeps at least 30 days in the database whatever the policy says', async () => {
    vi.mocked(AuditLog.collection.findOne).mockResolvedValue(null);
    await archiveAuditLogs(tenantId, 1, now);
    const cutoff: Date = (vi.mocked(AuditLog.collection.findOne).mock.calls[0] as any[])[0].timestamp.$lt;
    expect(now.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(30 * DAY);
  });
});

describe('deleteExpiredArchives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });
  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('deletes files whose month is past retention, never less than a year', async () => {
    const old = { _id: new Types.ObjectId(), pathname: 'audit-logs/x/2020-01-abc.jsonl.gz' };
    vi.mocked(AuditLogArchive.find).mockReturnValue({ select: () => ({ lean: async () => [old] }) } as any);

    expect(await deleteExpiredArchives(tenantId, 30, now)).toBe(1);
    const filter = (vi.mocked(AuditLogArchive.find).mock.calls[0] as any[])[0];
    expect(filter.month.$lt <= '2025-10').toBe(true); // floor of 365 days, not 30
    expect(del).toHaveBeenCalledWith(old.pathname);
    expect(AuditLogArchive.deleteOne).toHaveBeenCalledWith({ _id: old._id });
  });
});
