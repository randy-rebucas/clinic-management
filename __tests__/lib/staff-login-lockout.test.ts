import { describe, it, expect, beforeEach, vi } from 'vitest';

// The account-wide limit must stop distributed guessing without letting an attacker lock the
// real user out of the browser they normally sign in from.

const jar = new Map<string, string>();
const consumed: string[] = [];

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('@/app/lib/dal', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  createPending2fa: vi.fn(),
  readPending2fa: vi.fn(),
  clearPending2fa: vi.fn(),
  revokeUserSessions: vi.fn(),
  deriveKey: (purpose: string) => Buffer.from(`test-key-${purpose}`),
}));
vi.mock('@/lib/tenant', () => ({ getTenantContext: async () => ({ tenantId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ TURNSTILE_FAILED_MESSAGE: 'captcha', verifyTurnstile: vi.fn(async () => true) }));
vi.mock('@/app/api/auth/2fa/totp', () => ({ verifyUserTotp: vi.fn() }));
vi.mock('@/models/Role', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/User', () => ({
  default: { findOne: vi.fn(() => ({ select: () => ({ populate: async () => null }) })) },
}));
vi.mock('@/lib/middleware/rate-limit', () => ({
  getClientIp: () => '203.0.113.9',
  resetRateLimit: vi.fn(),
  rateLimiters: {
    authAccount: { config: { name: 'auth-account' } },
    authAccountGlobal: { config: { name: 'auth-account-global' } },
  },
  consumeRateLimit: vi.fn(async (config: { name: string }) => {
    consumed.push(config.name);
    // The account-wide budget is used up; the per-IP limits are fine.
    return { allowed: config.name !== 'auth-account-global', retryAfter: 600 };
  }),
}));

import bcrypt from 'bcryptjs';
import User from '@/models/User';
import { login } from '@/app/actions/auth';
import { createLoginDeviceToken } from '@/lib/login-device';

const ACCOUNT_KEY = 'staff:aaaaaaaaaaaaaaaaaaaaaaaa:doc@clinic.test';

function form(email: string, password: string) {
  const fd = new FormData();
  fd.set('email', email);
  fd.set('password', password);
  return fd;
}

describe('staff login when the account-wide limit is used up', () => {
  beforeEach(() => {
    jar.clear();
    consumed.length = 0;
  });

  it('blocks a browser that has never signed in to the account', async () => {
    const result = await login(undefined, form('doc@clinic.test', 'whatever'));
    expect(result?.errors?.email?.[0]).toMatch(/from new devices/);
    expect(consumed).toContain('auth-account-global');
  });

  it('lets a known browser through to the password check', async () => {
    jar.set('login_device', createLoginDeviceToken(ACCOUNT_KEY).token);
    const result = await login(undefined, form('doc@clinic.test', 'whatever'));
    // Reached the password check (no such user in this test) instead of the lockout.
    expect(result?.errors?.email?.[0]).toBe('Invalid email or password.');
    expect(consumed).not.toContain('auth-account-global');
  });

  it("doesn't accept another account's device cookie", async () => {
    jar.set('login_device', createLoginDeviceToken('staff:aaaaaaaaaaaaaaaaaaaaaaaa:other@clinic.test').token);
    const result = await login(undefined, form('doc@clinic.test', 'whatever'));
    expect(result?.errors?.email?.[0]).toMatch(/from new devices/);
  });
});

describe('staff login with an admin-issued temporary password', () => {
  const hash = bcrypt.hashSync('k7Qmz2hx', 4);
  const withUser = (fields: Record<string, unknown>) =>
    vi.mocked(User.findOne).mockReturnValueOnce({
      select: () => ({
        populate: async () => ({
          _id: { toString: () => 'u1' },
          email: 'doc@clinic.test',
          password: hash,
          status: 'active',
          role: { name: 'nurse' },
          ...fields,
        }),
      }),
    } as any);

  beforeEach(() => {
    jar.clear();
    jar.set('login_device', createLoginDeviceToken(ACCOUNT_KEY).token);
  });

  it('refuses one that has expired', async () => {
    withUser({ tempPassword: 'sealed', tempPasswordExpiresAt: new Date(Date.now() - 1000) });
    const result = await login(undefined, form('doc@clinic.test', 'k7Qmz2hx'));
    expect(result?.errors?.email?.[0]).toMatch(/temporary password has expired/);
  });

  it('sends the person to replace one that is still valid', async () => {
    withUser({ tempPassword: 'sealed', tempPasswordExpiresAt: new Date(Date.now() + 60_000) });
    await expect(login(undefined, form('doc@clinic.test', 'k7Qmz2hx'))).rejects.toMatchObject({
      to: '/settings?replaceTempPassword=1',
    });
  });

  it('goes to the dashboard after a normal password', async () => {
    withUser({});
    await expect(login(undefined, form('doc@clinic.test', 'k7Qmz2hx'))).rejects.toMatchObject({ to: '/dashboard' });
  });
});
