import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(async () => true), hashSync: () => 'x' } }));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/Role', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findById: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/app/lib/dal', () => ({
  issueSessionToken: vi.fn(),
  SESSION_TTL_SECONDS: 3600,
  issuePending2faToken: vi.fn(),
  verifyPending2faToken: vi.fn(),
}));
vi.mock('@/app/lib/refresh-tokens', () => ({ issueRefreshToken: vi.fn(), REFRESH_TOKEN_TTL_SECONDS: 86400 }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn(async () => ({ tenantId: null })) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  getClientIp: () => '1.2.3.4',
  resetRateLimit: vi.fn(),
  rateLimiters: { authAccount: { config: {} } },
}));
vi.mock('@/lib/otp', () => ({ consumeOtp: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-otp', () => ({ findRepsByVerifiedPhone: vi.fn() }));
vi.mock('@/lib/medrep-app-signup', () => ({ issueActivationToken: vi.fn(async () => ({ token: 'pass', expiresAt: new Date() })) }));
vi.mock('@/app/api/auth/2fa/totp', () => ({ verifyUserTotp: vi.fn() }));

import User from '@/models/User';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { consumeOtp } from '@/lib/otp';
import { verifyPending2faToken } from '@/app/lib/dal';
import { verifyUserTotp } from '@/app/api/auth/2fa/totp';
import { findRepsByVerifiedPhone } from '@/app/api/medical-representatives/_lib/rep-otp';
import { issueActivationToken } from '@/lib/medrep-app-signup';
import { verifyRepCredentials } from '@/app/api/medical-representatives/_lib/rep-login';
import { POST as verifyCode } from '@/app/api/medical-representatives/auth/otp/verify/route';
import { POST as twoFactor } from '@/app/api/medical-representatives/auth/2fa/route';

const ROLE = { _id: 'role1', name: 'medical-representative' };
const user = { _id: 'u1', email: 'rep@x.y', password: 'hash', status: 'active', role: ROLE, medicalRepresentativeProfile: 'p1', totpEnabled: true };
const DEACTIVATED = { success: false, error: 'Your account has been deactivated. Contact support.', code: 'MEDREP_DEACTIVATED' };
const post = (body: unknown) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) });

function profile(p: Record<string, unknown>) {
  vi.mocked(MedicalRepresentative.findById).mockResolvedValue({ _id: 'p1', userId: 'u1', ...p } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(User.findOne).mockReturnValue({ select: () => ({ populate: async () => user }) } as any);
  vi.mocked(User.findById).mockReturnValue({ populate: async () => user } as any);
});

describe('email + password sign-in', () => {
  it('MEDREP_DEACTIVATED (403, no payment prompt) for a paid rep an admin deactivated', async () => {
    profile({ isActivated: true, status: 'inactive' });
    const r = await verifyRepCredentials(post({ email: 'rep@x.y', password: 'pw' }));
    if (r.ok) throw new Error('expected a refusal');
    expect(r.response.status).toBe(403);
    expect(await r.response.json()).toEqual(DEACTIVATED);
  });

  it('still MEDREP_INACTIVE for a rep who hasn’t paid', async () => {
    profile({ isActivated: false, status: 'pending' });
    const r = await verifyRepCredentials(post({ email: 'rep@x.y', password: 'pw' }));
    if (r.ok) throw new Error('expected a refusal');
    expect(r.response.status).toBe(403);
    expect((await r.response.json()).code).toBe('MEDREP_INACTIVE');
  });
});

describe('sign-in by texted code', () => {
  beforeEach(() => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: true } as any);
  });

  it('MEDREP_DEACTIVATED without an activationToken for a paid, deactivated rep', async () => {
    vi.mocked(findRepsByVerifiedPhone).mockResolvedValue([
      { _id: 'p1', userId: 'u1', isActivated: true, status: 'inactive', paymentStatus: 'completed' },
    ] as any);
    const res = await verifyCode(post({ phone: '09171234567', code: '123456' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DEACTIVATED);
    expect(issueActivationToken).not.toHaveBeenCalled();
  });

  it('still MEDREP_INACTIVE with a pass to pay for an unpaid rep', async () => {
    vi.mocked(findRepsByVerifiedPhone).mockResolvedValue([
      { _id: 'p1', userId: 'u1', isActivated: false, status: 'pending', paymentStatus: 'pending' },
    ] as any);
    const res = await verifyCode(post({ phone: '09171234567', code: '123456' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'MEDREP_INACTIVE', activationToken: 'pass' });
  });
});

describe('second step (authenticator code)', () => {
  it('MEDREP_DEACTIVATED for a paid, deactivated rep', async () => {
    vi.mocked(verifyPending2faToken).mockResolvedValue({ userId: 'u1' } as any);
    profile({ isActivated: true, status: 'inactive' });
    const res = await twoFactor(post({ pendingToken: 't', code: '123456' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DEACTIVATED);
    expect(verifyUserTotp).not.toHaveBeenCalled();
  });
});
