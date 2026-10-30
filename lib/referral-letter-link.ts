import 'server-only';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * Short-lived links to a referral letter PDF for the patient app (see lib/signed-link.ts).
 * A link names one referral and expires after REFERRAL_LETTER_LINK_TTL_MS.
 */

export const REFERRAL_LETTER_LINK_TTL_MS = 10 * 60 * 1000;

const PURPOSE = 'referral-letter-pdf-link';

export function createReferralLetterLinkToken(referralId: string, now = Date.now()): { token: string; expiresAt: Date } {
  return createSignedLinkToken(PURPOSE, [referralId], REFERRAL_LETTER_LINK_TTL_MS, now);
}

/** The referral id, or null when the token is malformed, tampered with or expired. */
export function readReferralLetterLinkToken(token: string, now = Date.now()): string | null {
  const id = readSignedLinkToken(PURPOSE, token, 1, now)?.[0];
  return id && /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
