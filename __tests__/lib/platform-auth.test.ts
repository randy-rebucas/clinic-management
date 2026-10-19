import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn().mockResolvedValue({ subdomain: null, tenantId: null }) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

const spent = new Set<string>();
vi.mock('@/models/PlatformNonce', () => ({
  default: {
    create: vi.fn(async ({ jti }: { jti: string }) => {
      if (spent.has(jti)) throw Object.assign(new Error('dup'), { code: 11000 });
      spent.add(jti);
    }),
  },
}));

import { SignJWT, decodeJwt } from 'jose';
import { encrypt } from '@/app/lib/dal';
import {
  consumePlatformLoginToken,
  consumeViewAsHandoff,
  isPlatformAdminEmail,
  issuePlatformLoginToken,
  issueViewAsHandoff,
  verifyPlatformToken,
} from '@/lib/platform-auth';

const TENANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439022';

describe('platform auth', () => {
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = 'Ops@MyClinicSoft.test, second@myclinicsoft.test';
  });

  it('matches the allowlist case-insensitively', () => {
    expect(isPlatformAdminEmail(' ops@myclinicsoft.test ')).toBe(true);
    expect(isPlatformAdminEmail('someone@else.test')).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
  });

  it('spends a sign-in link exactly once', async () => {
    const token = await issuePlatformLoginToken('ops@myclinicsoft.test');
    expect(await consumePlatformLoginToken(token)).toBe('ops@myclinicsoft.test');
    expect(await consumePlatformLoginToken(token)).toBeNull();
  });

  it('refuses a sign-in link once the address leaves the allowlist', async () => {
    const token = await issuePlatformLoginToken('second@myclinicsoft.test');
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@myclinicsoft.test';
    expect(await consumePlatformLoginToken(token)).toBeNull();
  });

  it('does not accept one token type as another', async () => {
    const link = await issuePlatformLoginToken('ops@myclinicsoft.test');
    expect(await verifyPlatformToken(link)).toBeNull();
    const handoff = await issueViewAsHandoff({ tenantId: TENANT, userId: USER, platformEmail: 'ops@myclinicsoft.test' });
    expect(await consumePlatformLoginToken(handoff)).toBeNull();
  });

  it('does not accept a clinic staff session as a platform session', async () => {
    const staff = await encrypt({ userId: USER, email: 'ops@myclinicsoft.test', role: 'admin', expiresAt: new Date(Date.now() + 60_000) });
    expect(await verifyPlatformToken(staff)).toBeNull();
  });

  it('refuses a platform-shaped token signed with another key', async () => {
    const forged = await new SignJWT({ typ: 'platform', email: 'ops@myclinicsoft.test' })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti('x')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-key'));
    expect(await verifyPlatformToken(forged)).toBeNull();
  });

  it('spends a view-as hand-off exactly once and keeps its claims', async () => {
    const token = await issueViewAsHandoff({ tenantId: TENANT, userId: USER, platformEmail: 'ops@myclinicsoft.test' });
    expect(decodeJwt(token).exp! - decodeJwt(token).iat!).toBe(60);
    expect(await consumeViewAsHandoff(token)).toEqual({ tenantId: TENANT, userId: USER, platformEmail: 'ops@myclinicsoft.test' });
    expect(await consumeViewAsHandoff(token)).toBeNull();
  });
});
