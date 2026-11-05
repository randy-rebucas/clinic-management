import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Room', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn(async () => null) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: { public: {} } }));

import Queue from '@/models/Queue';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { getSettings } from '@/lib/settings';
import { applyRateLimit } from '@/lib/middleware/rate-limit';
import { POST } from '@/app/api/queue/check-in/route';

const TENANT = '507f1f77bcf86cd799439055';
const QUEUE = '507f1f77bcf86cd799439011';
const PATIENT = '507f1f77bcf86cd799439022';

const qrBody = { qrCode: JSON.stringify({ queueId: QUEUE, patientId: PATIENT }) };
const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/queue/check-in', { method: 'POST', body: JSON.stringify(body) }));

function entry(fields: Record<string, unknown> = {}) {
  const queue = { _id: QUEUE, patient: { _id: PATIENT }, queueNumber: 'A1', status: 'waiting', checkedIn: false, save: vi.fn(), ...fields };
  const found = { populate: () => found, then: (ok: any) => Promise.resolve(queue).then(ok) };
  vi.mocked(Queue.findOne).mockReturnValue(found as any);
  return queue;
}

describe('POST /api/queue/check-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue(null as any);
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: TENANT } as any);
    vi.mocked(getSettings).mockResolvedValue({ queueSettings: { patientSelfCheckIn: true } } as any);
    vi.mocked(applyRateLimit).mockResolvedValue(null);
  });

  it('checks in a matching QR at a clinic with self check-in on', async () => {
    const queue = entry();
    expect((await post(qrBody)).status).toBe(200);
    expect(queue.checkedIn).toBe(true);
    expect(applyRateLimit).toHaveBeenCalled();
  });

  it('refuses an anonymous QR at a clinic with self check-in off', async () => {
    vi.mocked(getSettings).mockResolvedValue({ queueSettings: { patientSelfCheckIn: false } } as any);
    expect((await post(qrBody)).status).toBe(403);
    expect(Queue.findOne).not.toHaveBeenCalled();
  });

  it('stops an anonymous caller at the rate limit, before any lookup', async () => {
    vi.mocked(applyRateLimit).mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await post(qrBody)).status).toBe(429);
    expect(getSettings).not.toHaveBeenCalled();
    expect(Queue.findOne).not.toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled', 'no-show'])('will not check in a %s entry', async (status) => {
    const queue = entry({ status });
    expect((await post(qrBody)).status).toBe(409);
    expect(queue.save).not.toHaveBeenCalled();
  });

  it('still refuses a QR for another patient', async () => {
    entry({ patient: { _id: '507f1f77bcf86cd799439033' } });
    expect((await post(qrBody)).status).toBe(403);
  });

  it('staff are not limited and can check in with self check-in off', async () => {
    vi.mocked(verifySession).mockResolvedValue({ tenantId: TENANT, userId: 'u', email: 'e', role: 'admin' } as any);
    vi.mocked(getSettings).mockResolvedValue({ queueSettings: { patientSelfCheckIn: false } } as any);
    const queue = entry();
    expect((await post({ queueId: QUEUE })).status).toBe(200);
    expect(queue.checkedIn).toBe(true);
    expect(applyRateLimit).not.toHaveBeenCalled();
  });
});
