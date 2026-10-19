import 'server-only';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * 10-minute links to a patient's health-summary PDF (see lib/signed-link.ts). The link carries
 * the record to summarise and the clinic scope of the session that asked for it ("-" = every
 * clinic), so the PDF shows exactly what the app showed.
 */

export const HEALTH_SUMMARY_LINK_TTL_MS = 10 * 60 * 1000;

const PURPOSE = 'health-summary-pdf-link';
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function createHealthSummaryLinkToken(patientId: string, tid: string | undefined, now = Date.now()) {
  return createSignedLinkToken(PURPOSE, [patientId, tid ?? '-'], HEALTH_SUMMARY_LINK_TTL_MS, now);
}

export function readHealthSummaryLinkToken(token: string, now = Date.now()): { patientId: string; tid?: string } | null {
  const parts = readSignedLinkToken(PURPOSE, token, 2, now);
  if (!parts) return null;
  const [patientId, tid] = parts;
  if (!OBJECT_ID.test(patientId) || (tid !== '-' && !OBJECT_ID.test(tid))) return null;
  return tid === '-' ? { patientId } : { patientId, tid };
}
