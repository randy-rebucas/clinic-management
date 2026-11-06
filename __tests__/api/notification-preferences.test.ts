import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/NotificationPreference', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/app/api/notifications/_lib/scope', () => ({
  requireNotificationScope: vi.fn(),
  isNotificationScopeError: (value: unknown) => value instanceof NextResponse,
}));

import NotificationPreference from '@/models/NotificationPreference';
import { requireNotificationScope } from '@/app/api/notifications/_lib/scope';
import { GET, PUT } from '@/app/api/notifications/preferences/route';

const USER = '64b000000000000000000001';
const QUIET = { enabled: true, start: '22:00', end: '07:00', timezone: 'Asia/Manila' };

const put = (body: unknown) =>
  PUT(new NextRequest('http://test/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(body) }));

const saved = (row: unknown) =>
  vi.mocked(NotificationPreference.findOneAndUpdate).mockReturnValue({ lean: () => Promise.resolve(row) } as any);

const updateCall = () => vi.mocked(NotificationPreference.findOneAndUpdate).mock.calls[0] as unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireNotificationScope).mockResolvedValue({ session: { userId: USER }, ownFilter: {} } as any);
  saved({ pausedUntil: null, quietHours: QUIET });
});

describe('GET /api/notifications/preferences', () => {
  it('needs a signed-in user', async () => {
    vi.mocked(requireNotificationScope).mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await GET()).status).toBe(401);
  });

  it('gives defaults to someone who has saved nothing', async () => {
    vi.mocked(NotificationPreference.findOne).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) } as any);
    const body = await (await GET()).json();
    expect(body.data).toEqual({ pausedUntil: null, quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: null } });
  });

  it('reads only the caller’s own row', async () => {
    vi.mocked(NotificationPreference.findOne).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) } as any);
    await GET();
    const filter = (vi.mocked(NotificationPreference.findOne).mock.calls[0] as unknown[])[0] as any;
    expect(String(filter.userId)).toBe(USER);
  });
});

describe('PUT /api/notifications/preferences', () => {
  it('needs a signed-in user', async () => {
    vi.mocked(requireNotificationScope).mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await put({ pausedUntil: null })).status).toBe(401);
    expect(NotificationPreference.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('saves quiet hours for the caller, whatever id the body claims', async () => {
    const res = await put({ quietHours: QUIET, userId: '64b000000000000000000099' });
    expect(res.status).toBe(200);
    const [filter, update] = updateCall() as any[];
    expect(String(filter.userId)).toBe(USER);
    expect(update.$set).toEqual({ quietHours: QUIET });
  });

  it('changes only the pause when only the pause is sent', async () => {
    const until = new Date(Date.now() + 3_600_000);
    await put({ pausedUntil: until.toISOString() });
    expect((updateCall() as any[])[1].$set).toEqual({ pausedUntil: until });
  });

  it('clears a pause with null', async () => {
    await put({ pausedUntil: null });
    expect((updateCall() as any[])[1].$set).toEqual({ pausedUntil: null });
  });

  it.each([
    ['an empty update', {}],
    ['a pause over 7 days', { pausedUntil: new Date(Date.now() + 8 * 86_400_000).toISOString() }],
    ['a date that is not one', { pausedUntil: 'tomorrow' }],
    ['a bad time', { quietHours: { ...QUIET, start: '25:00' } }],
    ['an empty window', { quietHours: { ...QUIET, end: '22:00' } }],
    ['an unknown timezone', { quietHours: { ...QUIET, timezone: 'Not/AZone' } }],
  ])('rejects %s', async (_name, body) => {
    expect((await put(body)).status).toBe(400);
    expect(NotificationPreference.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
