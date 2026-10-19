import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deriveKey } from '@/app/lib/dal';

/**
 * Short-lived signed links for the patient app. The app authenticates with a bearer token the
 * system browser can't send, so it asks for a signed link and opens that. Each purpose has its
 * own key, so a link minted for one document type never opens another.
 *
 * Token: base64url("<part>.<part>….<expiry ms>") + "." + HMAC. Parts must not contain ".".
 */

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function sign(purpose: string, payload: string): string {
  return createHmac('sha256', deriveKey(purpose)).update(payload).digest('base64url');
}

export function createSignedLinkToken(
  purpose: string,
  parts: string[],
  ttlMs: number,
  now = Date.now()
): { token: string; expiresAt: Date } {
  if (parts.some((p) => p.includes('.'))) throw new Error('Signed link parts must not contain "."');
  const expiresAt = new Date(now + ttlMs);
  const payload = [...parts, String(expiresAt.getTime())].join('.');
  return { token: `${b64url(payload)}.${sign(purpose, payload)}`, expiresAt };
}

/** The signed parts, or null when the token is malformed, tampered with, for another purpose or expired. */
export function readSignedLinkToken(purpose: string, token: string, partCount: number, now = Date.now()): string[] | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(purpose, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const fields = payload.split('.');
  if (fields.length !== partCount + 1) return null;
  if (!(Number(fields[partCount]) > now)) return null;
  return fields.slice(0, partCount);
}

/** This app's public origin as the caller reached it (behind Vercel's proxy too). */
export function requestOrigin(request: { headers: Headers; nextUrl: URL }): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || request.nextUrl.protocol.replace(':', '');
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}
