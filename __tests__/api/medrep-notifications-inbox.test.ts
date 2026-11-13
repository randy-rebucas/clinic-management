import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Notification', () => ({ default: { find: vi.fn(), countDocuments: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));

import Notification from '@/models/Notification';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { GET } from '@/app/api/medical-representatives/notifications/inbox/route';
import { POST as markRead } from '@/app/api/medical-representatives/notifications/inbox/read/route';

const USER = new Types.ObjectId('507f1f77bcf86cd799439044');
const N1 = new Types.ObjectId('507f1f77bcf86cd7994390e1');
const N2 = new Types.ObjectId('507f1f77bcf86cd7994390e2');
const N3 = new Types.ObjectId('507f1f77bcf86cd7994390e3');
const CREATED = new Date('2026-11-13T08:00:00Z');

/** A find() chain that records its calls and resolves to `rows`. */
function findChain(rows: unknown[]) {
  const chain: any = {};
  for (const m of ['select', 'sort', 'skip', 'limit']) chain[m] = vi.fn(() => chain);
  chain.lean = vi.fn(async () => rows);
  vi.mocked(Notification.find).mockReturnValue(chain);
  return chain;
}

/** countDocuments: the unread count when the filter asks for read:false, else the total. */
function counts(total: number, unread: number) {
  vi.mocked(Notification.countDocuments).mockImplementation(((filter: any) => Promise.resolve(filter.read === false ? unread : total)) as any);
}

const list = (qs = '') => GET(new NextRequest(`http://x/api/medical-representatives/notifications/inbox${qs}`));
const post = (body: unknown) =>
  markRead(
    new NextRequest('http://x/api/medical-representatives/notifications/inbox/read', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
});

describe('GET /api/medical-representatives/notifications/inbox', () => {
  it('lists the caller’s notifications newest first with kind/screen/entity from metadata', async () => {
    const chain = findChain([
      { _id: N1, type: 'visit', title: 'Visit approved', message: 'Sunrise approved…', metadata: { kind: 'visit', screen: 'visits', id: 'v1' }, read: false, createdAt: CREATED },
      { _id: N2, type: 'support', title: 'Support replied', message: 'Fixed.', metadata: { supportRequestId: 's1', batchId: 'b' }, read: true, createdAt: CREATED },
      { _id: N3, type: 'system', title: 'Old', message: 'Legacy', read: false, createdAt: CREATED },
    ]);
    counts(3, 2);

    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: [
        { id: String(N1), kind: 'visit', title: 'Visit approved', message: 'Sunrise approved…', screen: 'visits', entityId: 'v1', read: false, createdAt: CREATED.toISOString() },
        // older records without metadata: support → support/support, else system with no screen
        { id: String(N2), kind: 'support', title: 'Support replied', message: 'Fixed.', screen: 'support', entityId: 's1', read: true, createdAt: CREATED.toISOString() },
        { id: String(N3), kind: 'system', title: 'Old', message: 'Legacy', screen: null, entityId: null, read: false, createdAt: CREATED.toISOString() },
      ],
      pagination: { total: 3, page: 1, limit: 20, totalPages: 1 },
      unreadCount: 2,
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('scopes every query to the caller and leaves out expired notifications', async () => {
    findChain([]);
    counts(0, 0);
    const before = Date.now();
    await list();

    const filter = (vi.mocked(Notification.find).mock.calls[0] as any[])[0];
    expect(filter.user).toBe(USER);
    expect(filter).not.toHaveProperty('tenantId');
    expect(filter.$or).toEqual([{ expiresAt: { $gt: expect.any(Date) } }, { expiresAt: null }]);
    expect(filter.$or[0].expiresAt.$gt.getTime()).toBeGreaterThanOrEqual(before);
    for (const [f] of vi.mocked(Notification.countDocuments).mock.calls as any[]) {
      expect(f.user).toBe(USER);
      expect(f.$or).toHaveLength(2);
    }
    expect((vi.mocked(Notification.countDocuments).mock.calls as any[]).some(([f]) => f.read === false)).toBe(true);
  });

  it('pages with a default of 20 and a cap of 50', async () => {
    const chain = findChain([]);
    counts(120, 0);
    const body = await (await list('?page=3&limit=500')).json();
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.skip).toHaveBeenCalledWith(100);
    expect(body.pagination).toEqual({ total: 120, page: 3, limit: 50, totalPages: 3 });

    const again = findChain([]);
    await list('?page=abc&limit=-4');
    expect(again.skip).toHaveBeenCalledWith(0);
    expect(again.limit).toHaveBeenCalledWith(1);
  });
});

describe('POST /api/medical-representatives/notifications/inbox/read', () => {
  beforeEach(() => {
    vi.mocked(Notification.updateMany).mockResolvedValue({ modifiedCount: 1 } as any);
    counts(10, 4);
  });

  it('marks the caller’s own notifications read by id and returns the unread count', async () => {
    const res = await post({ ids: [String(N1), String(N2), String(N1)] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { unreadCount: 4 } });
    const [filter, update] = vi.mocked(Notification.updateMany).mock.calls[0] as any[];
    expect(filter.user).toBe(USER);
    expect(filter.read).toBe(false);
    expect(filter._id.$in.map(String)).toEqual([String(N1), String(N2)]);
    expect(update).toEqual({ $set: { read: true, readAt: expect.any(Date) } });
    expect((vi.mocked(Notification.countDocuments).mock.calls[0] as any[])[0]).toMatchObject({ user: USER, read: false });
  });

  it('marks all of the caller’s notifications read', async () => {
    const res = await post({ all: true });
    expect(res.status).toBe(200);
    const [filter] = vi.mocked(Notification.updateMany).mock.calls[0] as any[];
    expect(filter).toEqual({ user: USER, read: false });
  });

  it.each([
    ['no body', 'not json'],
    ['empty object', {}],
    ['all false', { all: false }],
    ['empty ids', { ids: [] }],
    ['bad id', { ids: ['nope'] }],
    ['too many ids', { ids: Array.from({ length: 101 }, () => String(new Types.ObjectId())) }],
    ['both', { ids: [String(N1)], all: true }],
  ])('400 on a bad body (%s)', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(Notification.updateMany).not.toHaveBeenCalled();
  });
});
