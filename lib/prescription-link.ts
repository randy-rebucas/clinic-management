import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deriveKey } from '@/app/lib/dal';

/**
 * Short-lived links to a prescription PDF for the patient app. The app authenticates with a
 * bearer token the system browser can't send, so it asks for a signed link and opens that.
 * A link names one prescription and expires after LINK_TTL_MS.
 */

export const LINK_TTL_MS = 10 * 60 * 1000;

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

function sign(payload: string): string {
  return createHmac('sha256', deriveKey('prescription-pdf-link')).update(payload).digest('base64url');
}

export function createPrescriptionLinkToken(prescriptionId: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + LINK_TTL_MS);
  const payload = `${prescriptionId}.${expiresAt.getTime()}`;
  return { token: `${b64url(payload)}.${sign(payload)}`, expiresAt };
}

/** The prescription id, or null when the token is malformed, tampered with or expired. */
export function readPrescriptionLinkToken(token: string, now = Date.now()): string | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [id, exp] = payload.split('.');
  if (!/^[a-f0-9]{24}$/i.test(id ?? '') || !(Number(exp) > now)) return null;
  return id;
}
