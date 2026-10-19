import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deriveKey } from '@/app/lib/dal';

/**
 * The clinic's self check-in QR. Patients scan it in the eMCR app when they arrive; the code
 * proves they are standing in front of the clinic's screen. It rotates every WINDOW_MS, and the
 * previous code is still accepted, so a scan is good for 5–10 minutes and a photo sent home
 * soon stops working.
 *
 * QR content: {"type":"clinic_checkin","tenantId":"<id>","code":"<code>"}
 */

export const CHECKIN_WINDOW_MS = 5 * 60 * 1000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function codeFor(tenantId: string, window: number): string {
  return createHmac('sha256', deriveKey('clinic-checkin-qr')).update(`${tenantId}.${window}`).digest('base64url').slice(0, 16);
}

export function checkInQr(tenantId: string, now = Date.now()): { qrData: string; expiresAt: Date } {
  const window = Math.floor(now / CHECKIN_WINDOW_MS);
  return {
    qrData: JSON.stringify({ type: 'clinic_checkin', tenantId, code: codeFor(tenantId, window) }),
    expiresAt: new Date((window + 1) * CHECKIN_WINDOW_MS),
  };
}

/** Read scanned QR data: the clinic and code, or null when it isn't a clinic check-in QR. */
export function readCheckInQr(qrCode: unknown): { tenantId: string; code: string } | null {
  let data: unknown = qrCode;
  if (typeof qrCode === 'string') {
    try {
      data = JSON.parse(qrCode);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { type, tenantId, code } = data as Record<string, unknown>;
  if (type !== 'clinic_checkin' || typeof tenantId !== 'string' || !OBJECT_ID.test(tenantId)) return null;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(code)) return null;
  return { tenantId, code };
}

/** True for the current or the previous window's code. */
export function verifyCheckInCode(tenantId: string, code: string, now = Date.now()): boolean {
  const window = Math.floor(now / CHECKIN_WINDOW_MS);
  const given = Buffer.from(code);
  return [window, window - 1].some((w) => {
    const expected = Buffer.from(codeFor(tenantId, w));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
