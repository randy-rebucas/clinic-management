import 'server-only';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * Short-lived links to a prescription PDF for the patient app (see lib/signed-link.ts).
 * A link names one prescription and expires after LINK_TTL_MS.
 */

export const LINK_TTL_MS = 10 * 60 * 1000;

const PURPOSE = 'prescription-pdf-link';

export function createPrescriptionLinkToken(prescriptionId: string, now = Date.now()): { token: string; expiresAt: Date } {
  return createSignedLinkToken(PURPOSE, [prescriptionId], LINK_TTL_MS, now);
}

/** The prescription id, or null when the token is malformed, tampered with or expired. */
export function readPrescriptionLinkToken(token: string, now = Date.now()): string | null {
  const id = readSignedLinkToken(PURPOSE, token, 1, now)?.[0];
  return id && /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
