import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn(async () => false) }));
vi.mock('@/lib/platform-config', () => ({ getPlatformFees: vi.fn(async () => ({ medrepActivationFee: 0 })) }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: { auth: {} } }));
vi.mock('@/lib/turnstile', () => ({ turnstileRejection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => {
  const Rep = vi.fn(function (this: any, fields: any) {
    Object.assign(this, fields, { _id: 'rep1', save: vi.fn() });
  });
  return { default: Object.assign(Rep, { findOne: vi.fn() }) };
});

import { turnstileRejection } from '@/lib/turnstile';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { POST } from '@/app/api/medical-representatives/onboard/route';

const valid = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', phone: '09171234567', company: 'Acme', turnstileToken: 'tok' };

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/medical-representatives/onboard', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/medical-representatives/onboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MEDREP_SELF_SIGNUP_ENABLED', 'true');
    vi.mocked(turnstileRejection).mockResolvedValue(null);
    vi.mocked((MedicalRepresentative as any).findOne).mockResolvedValue(null);
    vi.mocked(User.findOne).mockResolvedValue(null as any);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('registers a new rep', async () => {
    expect((await post(valid)).status).toBe(201);
    expect(turnstileRejection).toHaveBeenCalledWith(expect.anything(), 'tok');
  });

  it('refuses a failed captcha before touching the database', async () => {
    vi.mocked(turnstileRejection).mockResolvedValue(new Response(null, { status: 403 }) as any);
    expect((await post(valid)).status).toBe(403);
    expect((MedicalRepresentative as any).findOne).not.toHaveBeenCalled();
    expect(MedicalRepresentative).not.toHaveBeenCalled();
  });

  it('does not spend the captcha on a form with missing fields', async () => {
    expect((await post({ ...valid, company: '' })).status).toBe(400);
    expect(turnstileRejection).not.toHaveBeenCalled();
  });

  it('gives one reply for an existing rep and an existing staff account', async () => {
    vi.mocked((MedicalRepresentative as any).findOne).mockResolvedValueOnce({ _id: 'x' });
    const rep = await post(valid);

    vi.mocked(User.findOne).mockResolvedValueOnce({ _id: 'y' } as any);
    const staff = await post(valid);

    expect(rep.status).toBe(409);
    expect(staff.status).toBe(409);
    expect(await rep.json()).toEqual(await staff.json());
  });
});
