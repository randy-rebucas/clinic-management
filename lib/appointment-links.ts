import { createHmac, timingSafeEqual } from 'crypto';

export type AppointmentLinkAction = 'yes' | 'no';

/**
 * Signed confirm/cancel links sent to patients by SMS/email.
 *
 * Token = base64url(HMAC-SHA256(key, `${appointmentId}:${action}`)),
 * key = HMAC-SHA256(SESSION_SECRET, 'appointment-link-v1'), so the link key is
 * domain-separated from session signing.
 */
function linkKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return createHmac('sha256', secret).update('appointment-link-v1').digest();
}

export function appointmentActionToken(appointmentId: string, action: AppointmentLinkAction): string {
  return createHmac('sha256', linkKey())
    .update(`${String(appointmentId)}:${action}`)
    .digest('base64url');
}

/** Constant-time check of a token from a confirm/cancel link. */
export function verifyAppointmentActionToken(
  appointmentId: string,
  action: string,
  token: string | null | undefined
): boolean {
  if (!token || (action !== 'yes' && action !== 'no')) return false;
  let expected: string;
  try {
    expected = appointmentActionToken(appointmentId, action);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `${baseUrl}/api/appointments/{id}/confirm?action=yes|no&token=...` */
export function buildAppointmentActionUrl(
  baseUrl: string,
  appointmentId: string,
  action: AppointmentLinkAction
): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const id = encodeURIComponent(String(appointmentId));
  const token = appointmentActionToken(String(appointmentId), action);
  return `${base}/api/appointments/${id}/confirm?action=${action}&token=${encodeURIComponent(token)}`;
}
