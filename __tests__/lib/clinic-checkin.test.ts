import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { CHECKIN_WINDOW_MS, checkInQr, readCheckInQr, verifyCheckInCode } from '@/lib/clinic-checkin';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';
import { createPrescriptionLinkToken, readPrescriptionLinkToken } from '@/lib/prescription-link';
import { createHealthSummaryLinkToken, readHealthSummaryLinkToken } from '@/lib/health-summary-link';
import { ordinal } from '@/lib/queue-position';
import { positionsByLine } from '@/lib/automations/queue-notifications';

const TENANT = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const T0 = Date.UTC(2026, 9, 19, 8, 0, 0);

describe('clinic check-in QR', () => {
  it('round-trips and is accepted for the current and the previous window only', () => {
    const { qrData, expiresAt } = checkInQr(TENANT, T0);
    const qr = readCheckInQr(qrData);
    expect(qr?.tenantId).toBe(TENANT);
    expect(expiresAt.getTime()).toBeGreaterThan(T0);

    expect(verifyCheckInCode(TENANT, qr!.code, T0)).toBe(true);
    expect(verifyCheckInCode(TENANT, qr!.code, T0 + CHECKIN_WINDOW_MS)).toBe(true);
    expect(verifyCheckInCode(TENANT, qr!.code, T0 + 2 * CHECKIN_WINDOW_MS)).toBe(false);
  });

  it("one clinic's code doesn't check in at another", () => {
    const qr = readCheckInQr(checkInQr(TENANT, T0).qrData)!;
    expect(verifyCheckInCode(OTHER, qr.code, T0)).toBe(false);
  });

  it('rejects login QRs and junk', () => {
    expect(readCheckInQr('{"type":"patient_login","token":"x"}')).toBeNull();
    expect(readCheckInQr('not json')).toBeNull();
    expect(readCheckInQr({ type: 'clinic_checkin', tenantId: 'nope', code: 'abcdefghijklmnop' })).toBeNull();
  });
});

describe('signed links', () => {
  it('reads back its parts and refuses another purpose, tampering and expiry', () => {
    const { token } = createSignedLinkToken('a', ['x', 'y'], 1000, T0);
    expect(readSignedLinkToken('a', token, 2, T0)).toEqual(['x', 'y']);
    expect(readSignedLinkToken('b', token, 2, T0)).toBeNull();
    expect(readSignedLinkToken('a', token, 2, T0 + 1001)).toBeNull();
    expect(readSignedLinkToken('a', token.slice(0, -2) + 'AA', 2, T0)).toBeNull();
    expect(readSignedLinkToken('a', token, 1, T0)).toBeNull();
  });

  it('prescription links keep working through the shared helper', () => {
    const id = '507f1f77bcf86cd799439099';
    const { token } = createPrescriptionLinkToken(id, T0);
    expect(readPrescriptionLinkToken(token, T0)).toBe(id);
    expect(readHealthSummaryLinkToken(token, T0)).toBeNull();
  });

  it('health-summary links carry the clinic scope', () => {
    const id = '507f1f77bcf86cd799439099';
    expect(readHealthSummaryLinkToken(createHealthSummaryLinkToken(id, undefined, T0).token, T0)).toEqual({ patientId: id });
    expect(readHealthSummaryLinkToken(createHealthSummaryLinkToken(id, TENANT, T0).token, T0)).toEqual({ patientId: id, tid: TENANT });
  });
});

describe('queue positions', () => {
  it('counts each doctor line separately; unassigned patients share one', () => {
    const rows = positionsByLine([{ doctor: 'a' }, { doctor: 'b' }, { doctor: 'a' }, {}, { doctor: undefined }, { doctor: 'a' }]);
    expect(rows.map((r) => r.position)).toEqual([1, 1, 2, 1, 2, 3]);
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
