import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createLoginDeviceToken, isKnownLoginDevice, LOGIN_DEVICE_TTL_MS } from '@/lib/login-device';

describe('login device cookie', () => {
  const ACCOUNT = 'staff:t1:doc@clinic.test';

  it('recognises the browser for the account it signed in to, and only that one', () => {
    const { token } = createLoginDeviceToken(ACCOUNT);
    expect(isKnownLoginDevice(token, ACCOUNT)).toBe(true);
    expect(isKnownLoginDevice(token, 'staff:t2:doc@clinic.test')).toBe(false);
  });

  it('rejects missing, tampered and expired cookies', () => {
    const now = Date.now();
    const { token } = createLoginDeviceToken(ACCOUNT, now);
    expect(isKnownLoginDevice(undefined, ACCOUNT)).toBe(false);
    expect(isKnownLoginDevice(token.slice(0, -2) + 'xx', ACCOUNT)).toBe(false);
    expect(isKnownLoginDevice(token, ACCOUNT, now + LOGIN_DEVICE_TTL_MS + 1)).toBe(false);
  });
});
