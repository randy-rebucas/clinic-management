import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn(), verifySessionToken: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({
  refuseAccess: vi.fn(async () => NextResponse.json({ success: false }, { status: 403 })),
}));
vi.mock('@/app/lib/refresh-tokens', () => ({ consumeRefreshToken: vi.fn(), revokeRefreshFamily: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: { api: {} } }));
vi.mock('@/app/api/medical-representatives/_lib/rep-login', () => ({
  loadActiveRep: vi.fn(),
  issueRepAppTokens: vi.fn(),
}));

import { headers } from 'next/headers';
import { verifySession, verifySessionToken } from '@/app/lib/dal';
import { consumeRefreshToken, revokeRefreshFamily } from '@/app/lib/refresh-tokens';
import { loadActiveRep, issueRepAppTokens } from '@/app/api/medical-representatives/_lib/rep-login';
import { requireRepSession, isRepSessionError } from '@/app/api/medical-representatives/_lib/rep-session';
import { POST as refresh } from '@/app/api/medical-representatives/auth/refresh/route';

const REP_USER = '507f1f77bcf86cd7994390aa';
const repSession = { userId: REP_USER, email: 'rep@x.y', role: 'medical-representative' } as any;
const withAuth = (value?: string) =>
  vi.mocked(headers).mockResolvedValue(new Headers(value ? { authorization: value } : {}) as any);

describe('requireRepSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a Bearer token, checked against the database', async () => {
    withAuth('Bearer abc');
    vi.mocked(verifySessionToken).mockResolvedValue(repSession);
    const rep = await requireRepSession();
    expect(isRepSessionError(rep)).toBe(false);
    if (!isRepSessionError(rep)) {
      expect(rep.viaBearer).toBe(true);
      expect(String(rep.ownerFilter.userId)).toBe(REP_USER);
    }
    expect(verifySessionToken).toHaveBeenCalledWith('abc');
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('falls back to the cookie session', async () => {
    withAuth();
    vi.mocked(verifySession).mockResolvedValue(repSession);
    const rep = await requireRepSession();
    expect(!isRepSessionError(rep) && rep.viaBearer).toBe(false);
  });

  it('401 for an invalid token', async () => {
    withAuth('Bearer revoked');
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(((await requireRepSession()) as NextResponse).status).toBe(401);
  });

  it('403 for a staff (non-rep) token', async () => {
    withAuth('Bearer staff');
    vi.mocked(verifySessionToken).mockResolvedValue({ ...repSession, role: 'doctor' });
    expect(((await requireRepSession()) as NextResponse).status).toBe(403);
  });
});

describe('POST /api/medical-representatives/auth/refresh', () => {
  const post = (body: unknown) =>
    refresh(new NextRequest('http://localhost/api/medical-representatives/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    }));

  beforeEach(() => vi.clearAllMocks());

  it('rotates within the same family for an active rep', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({ ok: true, value: { subjectId: REP_USER, sessionVersion: 4, family: 'fam' } });
    vi.mocked(loadActiveRep).mockResolvedValue({ user: { _id: REP_USER, sessionVersion: 4 }, roleId: 'role' });
    vi.mocked(issueRepAppTokens).mockResolvedValue({ token: 't', refreshToken: 'r' } as any);
    const res = await post({ refreshToken: 'x' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, token: 't', refreshToken: 'r' });
    expect(issueRepAppTokens).toHaveBeenCalledWith(expect.anything(), 'role', 'fam');
  });

  it('refuses and revokes the family after a password change (version moved on)', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({ ok: true, value: { subjectId: REP_USER, sessionVersion: 4, family: 'fam' } });
    vi.mocked(loadActiveRep).mockResolvedValue({ user: { _id: REP_USER, sessionVersion: 5 } });
    const res = await post({ refreshToken: 'x' });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('REFRESH_INVALID');
    expect(revokeRefreshFamily).toHaveBeenCalledWith('fam');
    expect(issueRepAppTokens).not.toHaveBeenCalled();
  });

  it('refuses a deactivated rep', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({ ok: true, value: { subjectId: REP_USER, sessionVersion: 0, family: 'fam' } });
    vi.mocked(loadActiveRep).mockResolvedValue(null);
    expect((await post({ refreshToken: 'x' })).status).toBe(401);
  });

  it('passes a reuse signal through to the app', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({ ok: false, code: 'REFRESH_REUSED' });
    const res = await post({ refreshToken: 'x' });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('REFRESH_REUSED');
  });
});
