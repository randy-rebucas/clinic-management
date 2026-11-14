import 'server-only';
import { createHash } from 'node:crypto';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * "Known device" cookie for password sign-in.
 *
 * The per-account limit across all IPs stops a botnet from guessing one account's password, but on
 * its own it also lets anyone lock the real user out by sending wrong passwords. A browser that has
 * signed in to the account before carries this cookie and is not counted against that limit, so an
 * attack only blocks new devices. Per-IP limits still apply to everyone.
 */

export const LOGIN_DEVICE_COOKIE = 'login_device';
export const LOGIN_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PURPOSE = 'login-device';

function accountDigest(accountKey: string): string {
  return createHash('sha256').update(accountKey).digest('hex').slice(0, 32);
}

/** A cookie value that marks this browser as known for `accountKey`. */
export function createLoginDeviceToken(accountKey: string, now = Date.now()): { token: string; expiresAt: Date } {
  return createSignedLinkToken(PURPOSE, [accountDigest(accountKey)], LOGIN_DEVICE_TTL_MS, now);
}

/** True when `token` is a valid, unexpired known-device cookie for `accountKey`. */
export function isKnownLoginDevice(token: string | null | undefined, accountKey: string, now = Date.now()): boolean {
  if (!token) return false;
  const parts = readSignedLinkToken(PURPOSE, token, 1, now);
  return !!parts && parts[0] === accountDigest(accountKey);
}

export function loginDeviceCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
