import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * Proof that a visitor on a public form controls a number: issued after a code is checked, tied to
 * one number, clinic and form. It works until it expires rather than once, because a booking that
 * loses its slot to someone else must be able to try another time without a new code.
 */

const PROOF_LINK = 'public-phone-proof';
const PROOF_TTL_MS = 15 * 60 * 1000;

export const PUBLIC_CODE_PURPOSES = ['booking', 'registration'] as const;
export type PublicCodePurpose = (typeof PUBLIC_CODE_PURPOSES)[number];

/** Off until the sender is live: turning it on makes every online booking depend on texts arriving. */
export function publicPhoneProofRequired(): boolean {
  return process.env.REQUIRE_PUBLIC_PHONE_VERIFICATION === 'true';
}

export function createPhoneProof(phone: string, tenantId: Types.ObjectId, purpose: PublicCodePurpose) {
  return createSignedLinkToken(PROOF_LINK, [phone, String(tenantId), purpose], PROOF_TTL_MS);
}

export function phoneProofMatches(
  token: unknown,
  phone: string,
  tenantId: Types.ObjectId,
  purpose: PublicCodePurpose
): boolean {
  if (typeof token !== 'string' || !token) return false;
  const parts = readSignedLinkToken(PROOF_LINK, token, 3);
  return !!parts && parts[0] === phone && parts[1] === String(tenantId) && parts[2] === purpose;
}

/** The form answers this by showing its code step and sending the request again. */
export function phoneProofRequiredResponse() {
  return NextResponse.json(
    { success: false, code: 'PHONE_PROOF_REQUIRED', error: 'Please confirm your mobile number with a code first.' },
    { status: 403 }
  );
}
