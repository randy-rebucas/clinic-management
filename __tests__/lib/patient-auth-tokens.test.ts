import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({
  default: { findById: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), find: vi.fn(), exists: vi.fn() },
}));
vi.mock('@/models/MobileDevice', () => ({ default: { updateMany: vi.fn() } }));
vi.mock('@/models/RefreshToken', () => ({
  default: { create: vi.fn(), findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateMany: vi.fn() },
}));

import { SignJWT } from 'jose';
import Patient from '@/models/Patient';
import RefreshToken from '@/models/RefreshToken';
import { isFreshOtpSession, issuePatientToken, verifyPatientSession } from '@/app/lib/dal';
import { consumeRefreshToken, issueRefreshToken } from '@/app/lib/refresh-tokens';
import {
  authenticatePatientPassword,
  hashLoginQrToken,
  issuePatientLoginQr,
  LOGIN_QR_TTL_MINUTES,
  phoneRateKey,
  phoneVariants,
  redeemPatientLoginQr,
} from '@/app/api/patients/auth/shared';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const subject = { _id: PATIENT_ID, patientCode: 'P-1', email: 'p@x.y', sessionVersion: 2 };
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

function patientState(state: { active?: boolean; sessionVersion?: number } | null) {
  vi.mocked(Patient.findById).mockReturnValue({ select: vi.fn().mockReturnValue(lean(state)) } as any);
}

describe('patient token claims (tid / amr)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('round-trips tid and amr through issue and verify', async () => {
    patientState({ active: true, sessionVersion: 2 });
    const token = await issuePatientToken(subject, { tid: TENANT_A, amr: 'qr' });
    const session = await verifyPatientSession(token);
    expect(session).toMatchObject({ patientId: PATIENT_ID, tid: TENANT_A, amr: 'qr' });
  });

  it('omits tid when the sign-in is unscoped', async () => {
    patientState({ active: true, sessionVersion: 2 });
    const session = await verifyPatientSession(await issuePatientToken(subject, { amr: 'otp' }));
    expect(session?.tid).toBeUndefined();
    expect(session?.amr).toBe('otp');
  });

  it('refuses to sign a malformed tid', async () => {
    await expect(issuePatientToken(subject, { tid: 'clinic-a' })).rejects.toThrow();
  });

  it('rejects a token whose tid claim is malformed rather than treating it as unscoped', async () => {
    patientState({ active: true, sessionVersion: 0 });
    const key = new TextEncoder().encode('default-secret-key-change-in-production-dev-only');
    const forged = await new SignJWT({ typ: 'patient', type: 'patient', patientId: PATIENT_ID, pv: 0, tid: { $ne: null } })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    expect(await verifyPatientSession(forged)).toBeNull();
  });

  it('counts only a recent OTP sign-in as fresh phone proof', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isFreshOtpSession({ amr: 'otp', iat: now - 60 })).toBe(true);
    expect(isFreshOtpSession({ amr: 'otp', iat: now - 16 * 60 })).toBe(false);
    expect(isFreshOtpSession({ amr: 'qr', iat: now })).toBe(false);
    expect(isFreshOtpSession({ iat: now })).toBe(false);
  });
});

describe('refresh tokens carry the clinic scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores tid on the row and returns it when spent', async () => {
    await issueRefreshToken('patient', PATIENT_ID, 1, 'fam', { tid: TENANT_A });
    const row = vi.mocked(RefreshToken.create).mock.calls[0][0] as any;
    expect(String(row.scopeTenantId)).toBe(TENANT_A);

    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(
      lean({ subjectId: PATIENT_ID, sessionVersion: 1, family: 'fam', scopeTenantId: TENANT_A }) as any
    );
    const consumed = await consumeRefreshToken('a'.repeat(43), 'patient');
    expect(consumed).toEqual({ ok: true, value: { subjectId: PATIENT_ID, sessionVersion: 1, family: 'fam', tid: TENANT_A } });
  });

  it('unscoped rows have no tid', async () => {
    await issueRefreshToken('patient', PATIENT_ID, 1);
    expect((vi.mocked(RefreshToken.create).mock.calls[0][0] as any).scopeTenantId).toBeUndefined();
  });
});

describe('login QR', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is issued for 15 minutes with the issuing clinic recorded', async () => {
    const { qrData, expiresAt } = await issuePatientLoginQr(PATIENT_ID, { tenantId: TENANT_A });
    expect(LOGIN_QR_TTL_MINUTES).toBe(15);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    const [, update] = vi.mocked(Patient.updateOne).mock.calls[0] as any[];
    const token = JSON.parse(qrData).token;
    expect(update.$set.loginQrTokenHash).toBe(hashLoginQrToken(token));
    expect(String(update.$set.loginQrTenantId)).toBe(TENANT_A);
  });

  it('self-issued QR without a scope clears any previous scope', async () => {
    await issuePatientLoginQr(PATIENT_ID);
    const [, update] = vi.mocked(Patient.updateOne).mock.calls[0] as any[];
    expect(update.$set.loginQrTenantId).toBeUndefined();
    expect(update.$unset).toEqual({ loginQrTenantId: 1 });
  });

  it('is single use: redeemed and cleared in one atomic update', async () => {
    const token = 'Q'.repeat(43);
    vi.mocked(Patient.findOneAndUpdate)
      .mockResolvedValueOnce({ _id: PATIENT_ID, loginQrTenantId: TENANT_A } as any)
      .mockResolvedValueOnce(null as any);

    const first = await redeemPatientLoginQr(token);
    expect(first?.tid).toBe(TENANT_A);
    const [filter, update, options] = vi.mocked(Patient.findOneAndUpdate).mock.calls[0] as any[];
    expect(filter.loginQrTokenHash).toBe(hashLoginQrToken(token));
    expect(filter.loginQrTokenExpiry.$gt).toBeInstanceOf(Date);
    expect(filter.active).toEqual({ $ne: false });
    expect(update.$unset).toMatchObject({ loginQrTokenHash: 1, loginQrTokenExpiry: 1, loginQrTenantId: 1 });
    expect(options.new).toBe(false);

    // A second scan of the same QR finds nothing to redeem.
    expect(await redeemPatientLoginQr(token)).toBeNull();
  });
});

describe('phone matching', () => {
  it('matches every stored spelling of a Philippine number', () => {
    expect(new Set(phoneVariants('0917 123 4567'))).toEqual(
      new Set(['0917 123 4567', '+639171234567', '639171234567', '09171234567', '9171234567'])
    );
  });

  it('shares one rate-limit bucket across spellings', () => {
    expect(phoneRateKey('09171234567')).toBe(phoneRateKey('+63 917 123 4567'));
  });
});

describe('email + password sign-in', () => {
  beforeEach(() => vi.clearAllMocks());
  const findReturning = (rows: unknown[]) => {
    const chain: any = { select: vi.fn(), sort: vi.fn(), limit: vi.fn().mockResolvedValue(rows) };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    vi.mocked(Patient.find).mockReturnValue(chain);
    return chain;
  };

  it('tries every record with that email, not just the first', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const other = await bcrypt.hash('someone-else', 4);
    const mine = await bcrypt.hash('my-password', 4);
    findReturning([
      { _id: 'a', password: other, active: true },
      { _id: 'b', password: mine, active: true, passwordTenantId: TENANT_A },
    ]);
    const result = await authenticatePatientPassword('p@x.y', 'my-password');
    expect(result).toMatchObject({ ok: true, tid: TENANT_A });
    expect(result.ok && result.patient._id).toBe('b');
    expect(((vi.mocked(Patient.find).mock.calls[0] as any[])[0] as any).tenantIds).toBeUndefined();
  });

  it('reports an inactive match separately', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    findReturning([{ _id: 'a', password: await bcrypt.hash('pw-123456', 4), active: false }]);
    expect(await authenticatePatientPassword('p@x.y', 'pw-123456')).toMatchObject({ ok: false, reason: 'inactive' });
  });

  it('no candidates → invalid (after a dummy compare)', async () => {
    findReturning([]);
    expect(await authenticatePatientPassword('nobody@x.y', 'whatever')).toEqual({ ok: false, reason: 'invalid' });
  });
});
