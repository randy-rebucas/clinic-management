import 'server-only';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * Short-lived links to a released requested document (medical records copy, medical
 * certificate) for the patient app (see lib/signed-link.ts). A link names one document request
 * and expires after DOCUMENT_REQUEST_LINK_TTL_MS; the request must still be downloadable when
 * it is opened.
 */

export const DOCUMENT_REQUEST_LINK_TTL_MS = 10 * 60 * 1000;

const PURPOSE = 'document-request-pdf-link';

export function createDocumentRequestLinkToken(requestId: string, now = Date.now()): { token: string; expiresAt: Date } {
  return createSignedLinkToken(PURPOSE, [requestId], DOCUMENT_REQUEST_LINK_TTL_MS, now);
}

/** The document request id, or null when the token is malformed, tampered with or expired. */
export function readDocumentRequestLinkToken(token: string, now = Date.now()): string | null {
  const id = readSignedLinkToken(PURPOSE, token, 1, now)?.[0];
  return id && /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
