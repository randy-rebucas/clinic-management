import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: {} }));
vi.mock('@/lib/support', () => ({ notifyPlatformTeam: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', async () => {
  const { NextResponse: Res } = await import('next/server');
  return {
    requireRepSession: vi.fn(),
    isRepSessionError: (v: unknown) => v instanceof Res,
    repProfileFilter: () => ({}),
  };
});
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/SupportRequest', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/IdempotencyKey', () => ({
  default: { create: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn() },
}));

import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import SupportRequest from '@/models/SupportRequest';
import IdempotencyKey from '@/models/IdempotencyKey';
import { notifyPlatformTeam } from '@/lib/support';
import { GET as getDeletion, POST as postDeletion } from '@/app/api/medical-representatives/profile/deletion-request/route';
import { POST as postCrash } from '@/app/api/medical-representatives/client-errors/route';
import { GET as getAppConfig } from '@/app/api/medical-representatives/app-config/route';
import { withIdempotency } from '@/lib/idempotency';

const USER = new Types.ObjectId('507f1f77bcf86cd799439011');
const REQ = '507f1f77bcf86cd7994390ab';
const CREATED = new Date('2026-11-15T08:00:00Z');

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const openRequest = (r: Record<string, unknown> | null) =>
  vi.mocked(SupportRequest.findOne).mockReturnValue({ select: () => ({ sort: () => ({ lean: async () => r }) }) } as any);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRepSession).mockResolvedValue({
    session: { userId: String(USER), email: 'rep@example.com' },
    userObjectId: USER,
    ownerFilter: { userId: USER },
  } as any);
  openRequest(null);
  vi.mocked(MedicalRepresentative.findOne).mockReturnValue({
    select: () => ({ lean: async () => ({ _id: 'p1', firstName: 'Lia', lastName: 'Reyes', email: 'rep@example.com', company: 'Acme' }) }),
  } as any);
  vi.mocked(SupportRequest.create).mockResolvedValue({ _id: REQ, createdAt: CREATED } as any);
});

describe('eMedRoute account deletion request', () => {
  it('signed out: the session error passes through', async () => {
    vi.mocked(requireRepSession).mockResolvedValue(NextResponse.json({}, { status: 401 }) as any);
    expect((await getDeletion()).status).toBe(401);
  });

  it('GET answers null when nothing is open', async () => {
    expect(await (await getDeletion()).json()).toEqual({ success: true, data: null });
  });

  it('POST files an account-deletion request in the support queue', async () => {
    const res = await postDeletion(post({ reason: 'Changed jobs' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ reference: 'SR-4390AB', status: 'open', requestedAt: CREATED.toISOString() });
    const doc = vi.mocked(SupportRequest.create).mock.calls[0][0] as any;
    expect(doc).toMatchObject({ source: 'medical-rep', kind: 'account-deletion', category: 'account', email: 'rep@example.com' });
    expect(doc.message).toContain('Reason: Changed jobs');
    expect(notifyPlatformTeam).toHaveBeenCalled();
  });

  it('POST returns the open request instead of filing another', async () => {
    openRequest({ _id: REQ, status: 'in-progress', createdAt: CREATED });
    const res = await postDeletion(post({}));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('in-progress');
    expect(SupportRequest.create).not.toHaveBeenCalled();
  });
});

describe('crash reports', () => {
  it('logs a report and refuses one with no message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await postCrash(post({ message: 'boom', screen: '/visits/1', appVersion: '1.0.2' }))).status).toBe(200);
    expect(spy.mock.calls[0][0]).toBe('[eMedRoute crash]');
    expect((await postCrash(post({}))).status).toBe(400);
    spy.mockRestore();
  });
});

describe('app-config', () => {
  it('ignores a malformed minimum version', async () => {
    process.env.EMEDROUTE_MIN_VERSION = 'v1';
    process.env.EMEDROUTE_LATEST_VERSION = '1.0.3';
    const { data } = await (await getAppConfig()).json();
    expect(data.minVersion).toBeNull();
    expect(data.latestVersion).toBe('1.0.3');
    delete process.env.EMEDROUTE_MIN_VERSION;
    delete process.env.EMEDROUTE_LATEST_VERSION;
  });
});

describe('withIdempotency', () => {
  const KEY = { 'idempotency-key': 'abcdef12-3456' };
  const ok = () => NextResponse.json({ success: true, data: { id: 'd1' } });

  it('runs straight through without a key', async () => {
    const handler = vi.fn(async () => ok());
    await withIdempotency(post({}), USER, 'rep-delivery', handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(IdempotencyKey.create).not.toHaveBeenCalled();
  });

  it('stores the first success and replays it for the same key', async () => {
    vi.mocked(IdempotencyKey.create).mockResolvedValueOnce({} as any);
    vi.mocked(IdempotencyKey.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    await withIdempotency(post({}, KEY), USER, 'rep-delivery', async () => ok());
    expect((vi.mocked(IdempotencyKey.updateOne).mock.calls[0] as unknown[])[1]).toMatchObject({ $set: { state: 'done', statusCode: 200 } });

    vi.mocked(IdempotencyKey.create).mockRejectedValueOnce({ code: 11000 });
    vi.mocked(IdempotencyKey.findOne).mockReturnValue({
      lean: async () => ({ state: 'done', statusCode: 200, response: { success: true, data: { id: 'd1' } }, createdAt: new Date() }),
    } as any);
    const handler = vi.fn(async () => ok());
    const res = await withIdempotency(post({}, KEY), USER, 'rep-delivery', handler);
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('Idempotent-Replay')).toBe('true');
    expect((await res.json()).data.id).toBe('d1');
  });

  it('answers 409 while the first try is still running', async () => {
    vi.mocked(IdempotencyKey.create).mockRejectedValueOnce({ code: 11000 });
    vi.mocked(IdempotencyKey.findOne).mockReturnValue({ lean: async () => ({ state: 'pending', createdAt: new Date() }) } as any);
    vi.mocked(IdempotencyKey.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    const res = await withIdempotency(post({}, KEY), USER, 'rep-delivery', async () => ok());
    expect(res.status).toBe(409);
  });

  it('frees the key after a failed answer, so a corrected retry runs', async () => {
    vi.mocked(IdempotencyKey.create).mockResolvedValueOnce({} as any);
    vi.mocked(IdempotencyKey.deleteOne).mockResolvedValue({} as any);
    await withIdempotency(post({}, KEY), USER, 'rep-delivery', async () => NextResponse.json({}, { status: 400 }));
    expect(IdempotencyKey.deleteOne).toHaveBeenCalled();
  });
});
