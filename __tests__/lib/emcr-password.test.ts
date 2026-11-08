import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/lib/emcr/account', () => ({ forgetAccountCache: vi.fn(), findAccountForSession: vi.fn() }));
vi.mock('@/lib/emcr/login-id', () => ({ ensureLoginId: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { updateMany: vi.fn() } }));
vi.mock('@/lib/patient-family', () => ({ personRecordIds: vi.fn() }));
vi.mock('@/app/lib/dal', () => ({ revokeEmcrAccountSessions: vi.fn() }));
vi.mock('@/app/api/patients/auth/shared', () => ({
  dummyPasswordHash: () => '$2a$04$abcdefghijklmnopqrstuu1Yq0xqQ2oS0mGk0n7u5qk1m3X3vZb0a',
  revokeAllPatientAccess: vi.fn(),
}));

import { Types } from 'mongoose';
import EmcrAccount from '@/models/EmcrAccount';
import { findAccountForSession } from '@/lib/emcr/account';
import Patient from '@/models/Patient';
import { personRecordIds } from '@/lib/patient-family';
import { revokeAllPatientAccess } from '@/app/api/patients/auth/shared';
import { revokeEmcrAccountSessions } from '@/app/lib/dal';
import {
  authenticateAccountPassword,
  cancelClinicPassword,
  generateTempPassword,
  passwordProblem,
  applyPatientPasswordChange,
  replaceRecordPasswords,
  setAccountPassword,
} from '@/lib/emcr/password';

const PHONE = '+639171234567';
const CLINIC = new Types.ObjectId();
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

describe('applyPatientPasswordChange', () => {
  const ACCOUNT = new Types.ObjectId();
  const OWN = new Types.ObjectId();
  const SIBLING = new Types.ObjectId();
  const session = { patientId: String(OWN) };
  const hasAccount = (extra: Record<string, unknown> = {}) =>
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: ACCOUNT, passwordSetAt: new Date(), ...extra } as any);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(personRecordIds).mockResolvedValue([OWN, SIBLING]);
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ password: 'old-hash' }) as any);
  });

  it("replaces the person's other patient passwords and signs those records out", async () => {
    hasAccount();
    await applyPatientPasswordChange(session, 'brand-new-pw', { phoneProven: false });
    const [filter, update] = vi.mocked(Patient.updateMany).mock.calls[0] as any[];
    expect(filter._id.$in).toEqual([SIBLING]);
    expect(filter.password).toEqual({ $exists: true });
    expect(await bcrypt.compare('brand-new-pw', update.$set.password)).toBe(true);
    expect(update.$unset).toBeUndefined();
    expect(vi.mocked(revokeAllPatientAccess).mock.calls).toEqual([[String(SIBLING)]]);
  });

  it("keeps a clinic-scoped session to its clinic's records and sessions", async () => {
    hasAccount();
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: false });
    const [filter] = vi.mocked(Patient.updateMany).mock.calls[0] as any[];
    expect(String(filter.passwordTenantId)).toBe(String(CLINIC));
    expect(revokeAllPatientAccess).not.toHaveBeenCalled();
  });

  it('proving the phone lifts the scope and the ties', async () => {
    hasAccount();
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: true });
    const [filter, update] = vi.mocked(Patient.updateMany).mock.calls[0] as any[];
    expect(filter.passwordTenantId).toBeUndefined();
    expect(update.$unset).toEqual({ passwordTenantId: 1 });
    expect(revokeAllPatientAccess).toHaveBeenCalledTimes(1);
  });

  it('a person with one record has nothing else to change', async () => {
    vi.mocked(personRecordIds).mockResolvedValue([OWN]);
    await replaceRecordPasswords(OWN, 'brand-new-pw', {}, { phoneProven: false, exceptId: String(OWN) });
    expect(Patient.updateMany).not.toHaveBeenCalled();
  });

  it("replaces the account's password, so the phone sign-in doesn't keep the old one", async () => {
    hasAccount();
    await applyPatientPasswordChange(session, 'brand-new-pw', { phoneProven: false });
    const [filter, update] = vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[];
    expect(filter._id).toBe(ACCOUNT);
    expect(await bcrypt.compare('brand-new-pw', update.$set.password)).toBe(true);
    expect(update.$unset).toBeUndefined();
  });

  it('lifts the clinic tie once the phone is proven', async () => {
    hasAccount({ passwordTenantId: CLINIC });
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: true });
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$unset).toEqual({ passwordTenantId: 1 });
  });

  it('gives an account without a password none', async () => {
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: ACCOUNT } as any);
    await applyPatientPasswordChange(session, 'brand-new-pw', { phoneProven: true });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it('a clinic-scoped session cannot replace a password that reaches every clinic', async () => {
    hasAccount();
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: false });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it("a clinic-scoped session cannot replace another clinic's password", async () => {
    hasAccount({ passwordTenantId: new Types.ObjectId() });
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: false });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it("a clinic-scoped session replaces its own clinic's password and keeps the tie", async () => {
    hasAccount({ passwordTenantId: CLINIC });
    await applyPatientPasswordChange({ ...session, tid: String(CLINIC) }, 'brand-new-pw', { phoneProven: false });
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$unset).toBeUndefined();
  });
});

describe('eMCR account passwords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ password: 'old-hash' }) as any);
  });

  it('temporary passwords are 10 readable characters and long enough', () => {
    for (let i = 0; i < 20; i++) {
      const temp = generateTempPassword();
      expect(temp).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
      expect(passwordProblem(temp)).toBeNull();
    }
  });

  it('rejects short passwords', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem(undefined)).not.toBeNull();
  });

  it('a staff-set password must be changed; a user-set one need not', async () => {
    const id = new Types.ObjectId();
    await setAccountPassword(id, 'temp-pass-1', 'staff', CLINIC);
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$set).toMatchObject({ passwordSetBy: 'staff', mustChangePassword: true });
    await setAccountPassword(id, 'Mine-12345', 'user');
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[1] as any[])[1].$set).toMatchObject({ passwordSetBy: 'user', mustChangePassword: false });
  });

  it("replacing a password ends the account's guardian sessions; so does cancelling a clinic password", async () => {
    const id = new Types.ObjectId();
    await setAccountPassword(id, 'Mine-12345', 'user');
    expect(revokeEmcrAccountSessions).toHaveBeenCalledWith(String(id));
    await cancelClinicPassword(id);
    expect(revokeEmcrAccountSessions).toHaveBeenCalledTimes(2);
  });

  it("a first password keeps the account's guardian sessions (older apps don't ask for a fresh pair)", async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({}) as any);
    await setAccountPassword(new Types.ObjectId(), 'Mine-12345', 'user');
    expect(EmcrAccount.updateOne).toHaveBeenCalled();
    expect(revokeEmcrAccountSessions).not.toHaveBeenCalled();
  });

  it('a staff-set password is tied to its clinic, and refused without one', async () => {
    const id = new Types.ObjectId();
    await setAccountPassword(id, 'temp-pass-1', 'staff', CLINIC);
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$set).toMatchObject({ passwordTenantId: CLINIC });
    await expect(setAccountPassword(id, 'temp-pass-1', 'staff')).rejects.toThrow();
  });

  it('replacing a password lifts the clinic tie only after phone proof', async () => {
    const id = new Types.ObjectId();
    await setAccountPassword(id, 'Mine-12345', 'user');
    const kept = (vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1];
    expect(kept).not.toHaveProperty('$unset');
    expect(kept.$set).not.toHaveProperty('passwordTenantId');
    await setAccountPassword(id, 'Mine-12345', 'user', undefined, { phoneProven: true });
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[1] as any[])[1].$unset).toEqual({ passwordTenantId: 1 });
  });

  it('cancelling a clinic password removes it completely', async () => {
    await cancelClinicPassword(new Types.ObjectId());
    expect(Object.keys((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$unset).sort()).toEqual([
      'mustChangePassword',
      'password',
      'passwordSetAt',
      'passwordSetBy',
      'passwordTenantId',
    ]);
  });

  it('signs in with the right password and hides the hash', async () => {
    const hash = await bcrypt.hash('Correct-123', 4);
    vi.mocked(EmcrAccount.findOne).mockReturnValue(selectLean({ _id: new Types.ObjectId(), phone: PHONE, password: hash }) as any);
    const account = await authenticateAccountPassword({ phone: PHONE }, 'Correct-123');
    expect(account).toMatchObject({ phone: PHONE });
    expect(account).not.toHaveProperty('password');
  });

  it('refuses a wrong password, a number without a password, and a disabled account', async () => {
    const hash = await bcrypt.hash('Correct-123', 4);
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId(), password: hash }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Wrong-123')).toBeNull();
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId() }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Correct-123')).toBeNull();
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId(), password: hash, disabled: true }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Correct-123')).toBeNull();
  });
});
