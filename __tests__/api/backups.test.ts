import { gunzipSync } from 'zlib';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ isAdmin: vi.fn(() => true), refuseAccess: vi.fn(() => new Response(null, { status: 403 })) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/api/tenant-session', () => ({
  requireTenantSession: vi.fn(),
  isTenantSessionError: () => false,
  isValidId: () => true,
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/models/BackupRecord', () => ({
  default: { findOne: vi.fn(), findOneAndDelete: vi.fn(), countDocuments: vi.fn(), create: vi.fn() },
}));

import mongoose, { Types } from 'mongoose';
import BackupRecord from '@/models/BackupRecord';
import { isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { MAX_BACKUPS_PER_CLINIC } from '@/lib/backups';
import { POST } from '@/app/api/backups/route';
import { DELETE } from '@/app/api/backups/[id]/route';
import { GET as DOWNLOAD } from '@/app/api/backups/[id]/download/route';

const CLINIC = new Types.ObjectId();
const ID = String(new Types.ObjectId());
const route = { params: Promise.resolve({ id: ID }) };
const request = (method = 'GET') => new NextRequest(`http://localhost/api/backups/${ID}`, { method });
const leanOf = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAdmin).mockReturnValue(true);
  vi.mocked(requireTenantSession).mockResolvedValue({
    session: { userId: 'u', email: 'a@b.c', role: 'admin' },
    tenantId: String(CLINIC),
    tenantObjectId: CLINIC,
  } as any);
});

describe('GET /api/backups/:id/download', () => {
  it('serves the backup of this clinic as gzipped Extended JSON, and audits it', async () => {
    const patient = new Types.ObjectId();
    vi.mocked(BackupRecord.findOne).mockReturnValue(
      leanOf({ _id: new Types.ObjectId(ID), createdAt: new Date('2026-11-06T00:00:00Z'), data: { patients: [{ _id: patient }] } }) as any
    );
    const res = await DOWNLOAD(request(), route);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('backup-2026-11-06.json.gz');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(vi.mocked(BackupRecord.findOne).mock.calls[0][0]).toEqual({ _id: ID, tenantId: CLINIC });

    const json = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
    const parsed = mongoose.mongo.BSON.EJSON.parse(json) as any;
    expect(String(parsed.data.patients[0]._id)).toBe(String(patient));
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({ action: 'download', isSensitive: true });
  });

  it('finds nothing for a backup of another clinic', async () => {
    vi.mocked(BackupRecord.findOne).mockReturnValue(leanOf(null) as any);
    expect((await DOWNLOAD(request(), route)).status).toBe(404);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('is for administrators only', async () => {
    vi.mocked(isAdmin).mockReturnValue(false);
    expect((await DOWNLOAD(request(), route)).status).toBe(403);
    expect(BackupRecord.findOne).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/backups/:id', () => {
  const removed = (value: unknown) =>
    vi.mocked(BackupRecord.findOneAndDelete).mockReturnValue({ select: () => leanOf(value) } as any);

  it('deletes only within this clinic, without loading the contents, and audits it', async () => {
    removed({ _id: new Types.ObjectId(ID), createdAt: new Date(), sizeBytes: 10 });
    const res = await DELETE(request('DELETE'), route);
    expect(res.status).toBe(200);
    expect(vi.mocked(BackupRecord.findOneAndDelete).mock.calls[0][0]).toEqual({ _id: ID, tenantId: CLINIC });
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({ action: 'delete', resource: 'system' });
  });

  it('finds nothing for a backup of another clinic', async () => {
    removed(null);
    expect((await DELETE(request('DELETE'), route)).status).toBe(404);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('is for administrators only', async () => {
    vi.mocked(isAdmin).mockReturnValue(false);
    expect((await DELETE(request('DELETE'), route)).status).toBe(403);
    expect(BackupRecord.findOneAndDelete).not.toHaveBeenCalled();
  });
});

describe('POST /api/backups', () => {
  it('refuses at the limit before reading any records, and deletes nothing', async () => {
    vi.mocked(BackupRecord.countDocuments).mockResolvedValue(MAX_BACKUPS_PER_CLINIC as never);
    const res = await POST(new NextRequest('http://localhost/api/backups', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(409);
    expect(vi.mocked(BackupRecord.countDocuments).mock.calls[0][0]).toEqual({ tenantId: CLINIC });
    expect(BackupRecord.create).not.toHaveBeenCalled();
    expect(BackupRecord.findOneAndDelete).not.toHaveBeenCalled();
  });
});
