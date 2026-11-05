import 'server-only';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

const OPT_OUT_LINK = 'sms-opt-out';
/** Long-lived: a patient may act on an old text. It can only stop texts, never read anything. */
const OPT_OUT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Patients can't reply STOP to the alphanumeric sender, so promotional texts carry this instead. */
export function smsOptOutUrl(phone: string, tenantId: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const { token } = createSignedLinkToken(OPT_OUT_LINK, [phone, tenantId], OPT_OUT_TTL_MS);
  return `${base}/sms/opt-out/${token}`;
}

export function readSmsOptOutToken(token: unknown): { phone: string; tenantId: string } | null {
  if (typeof token !== 'string' || !token) return null;
  const parts = readSignedLinkToken(OPT_OUT_LINK, token, 2);
  return parts ? { phone: parts[0], tenantId: parts[1] } : null;
}
