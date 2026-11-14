import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/app/lib/dal', () => ({ issuePending2faToken: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: () => '203.0.113.9',
  rateLimiters: { repLoginCodeGlobal: { config: {} } },
}));
vi.mock('@/lib/otp', () => ({
  consumeOtp: vi.fn(),
  otpAvailable: vi.fn(() => true),
  startOtp: vi.fn(),
  startDecoyOtp: vi.fn(),
}));
vi.mock('@/app/api/medical-representatives/_lib/rep-login', () => ({ auditRepSignIn: vi.fn(), repTokenResponse: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-otp', () => ({
  findRepsByVerifiedPhone: vi.fn(),
  REP_LOGIN_CODE_MINUTES: 10,
  repLoginCodeMessage: vi.fn(),
}));
vi.mock('@/lib/medrep-app-signup', () => ({ issueActivationToken: vi.fn() }));
// Run `after()` work straight away so the test can see it.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

import { consumeOtp, startDecoyOtp, startOtp } from '@/lib/otp';
import { findRepsByVerifiedPhone } from '@/app/api/medical-representatives/_lib/rep-otp';
import { POST as verify } from '@/app/api/medical-representatives/auth/otp/verify/route';
import { POST as requestCode } from '@/app/api/medical-representatives/auth/otp/request/route';

const post = (handler: typeof verify, body: unknown) =>
  handler(new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) }));

describe('rep sign-in codes do not reveal which numbers have an account', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers a code for a number with no challenge as a wrong code, not as expired', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'invalid', noChallenge: true });
    const res = await post(verify, { phone: '09171234567', code: '000000' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CODE_INVALID');
  });

  it('still says expired for a real challenge that lapsed', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'expired' });
    const res = await post(verify, { phone: '09171234567', code: '000000' });
    expect((await res.json()).code).toBe('CODE_EXPIRED');
  });

  it('stores a decoy challenge for a number with no account, and texts no one', async () => {
    vi.mocked(findRepsByVerifiedPhone).mockResolvedValue([] as any);
    const res = await post(requestCode, { phone: '09171234567' });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(startDecoyOtp).toHaveBeenCalledWith({ scope: 'medrep-login', phone: '+639171234567' }));
    expect(startOtp).not.toHaveBeenCalled();
  });

  it('texts a real code to a number with an account', async () => {
    vi.mocked(findRepsByVerifiedPhone).mockResolvedValue([{ _id: 'r' }] as any);
    await post(requestCode, { phone: '09171234567' });
    await vi.waitFor(() => expect(startOtp).toHaveBeenCalled());
    expect(startDecoyOtp).not.toHaveBeenCalled();
  });
});
