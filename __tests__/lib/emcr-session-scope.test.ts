import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/EmcrAccessRequest', () => ({ default: {} }));
vi.mock('@/app/lib/dal', () => ({
  issuePatientToken: vi.fn().mockResolvedValue('token'),
  emcrAccountSessionVersion: vi.fn().mockResolvedValue(3),
  PATIENT_TOKEN_TTL_SECONDS: 60,
}));
vi.mock('@/app/lib/refresh-tokens', () => ({ issueRefreshToken: vi.fn().mockResolvedValue('refresh'), REFRESH_TOKEN_TTL_SECONDS: 60 }));
vi.mock('@/lib/otp', () => ({ consumeOtp: vi.fn().mockResolvedValue({ ok: true }), OTP_EXPIRY_MINUTES: 5, startOtp: vi.fn() }));
vi.mock('@/lib/emcr/account', () => ({ accountSessionSubject: vi.fn() }));
vi.mock('@/lib/emcr/activation', () => ({ activationView: vi.fn() }));
vi.mock('@/lib/emcr/login-id', () => ({ fullLoginId: vi.fn() }));
vi.mock('@/lib/emcr/password', () => ({ cancelClinicPassword: vi.fn() }));

import { Types } from 'mongoose';
import EmcrAccount from '@/models/EmcrAccount';
import { issuePatientToken } from '@/app/lib/dal';
import { issueRefreshToken } from '@/app/lib/refresh-tokens';
import { accountSessionSubject } from '@/lib/emcr/account';
import { cancelClinicPassword } from '@/lib/emcr/password';
import { accountSessionFields, consumeAccountOtp } from '@/lib/emcr/session';

const CLINIC = new Types.ObjectId();
const PHONE = '+639171234567';
const account = { _id: new Types.ObjectId(), phone: PHONE, passwordTenantId: CLINIC };
const refreshScope = () => vi.mocked(issueRefreshToken).mock.calls[0][4];

describe('eMCR sessions from a password a clinic knows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountSessionSubject).mockResolvedValue({ patient: { _id: new Types.ObjectId(), sessionVersion: 0 } });
  });

  it('a password sign-in reaches that clinic only, across refreshes too', async () => {
    await accountSessionFields(account, 'password');
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toMatchObject({ tid: String(CLINIC), amr: 'password' });
    expect(refreshScope()).toMatchObject({ tid: String(CLINIC) });
  });

  it("puts the account's session version on the token and the refresh chain", async () => {
    await accountSessionFields(account, 'otp');
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toMatchObject({ av: 3 });
    expect(refreshScope()).toMatchObject({ av: 3 });
  });

  it('an SMS sign-in is not narrowed', async () => {
    await accountSessionFields(account, 'otp');
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toMatchObject({ tid: undefined });
    expect(refreshScope()).toMatchObject({ tid: undefined });
  });

  it('a password the holder set after proving the phone is not narrowed', async () => {
    await accountSessionFields({ _id: account._id, phone: PHONE }, 'password');
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toMatchObject({ tid: undefined });
  });

  it('proving the phone cancels the password the clinic knows', async () => {
    const stored = { ...account, passwordSetBy: 'staff', passwordSetAt: new Date(), mustChangePassword: true };
    vi.mocked(EmcrAccount.findOneAndUpdate).mockReturnValue({ lean: vi.fn().mockResolvedValue(stored) } as any);
    const result = await consumeAccountOtp(PHONE, '123456');
    expect(cancelClinicPassword).toHaveBeenCalledWith(account._id);
    expect(result).toMatchObject({ ok: true });
    const fresh = (result as { account: object }).account;
    for (const field of ['passwordTenantId', 'passwordSetAt', 'passwordSetBy', 'mustChangePassword']) {
      expect(fresh).not.toHaveProperty(field);
    }
  });

  it('proving the phone leaves a password the holder chose alone', async () => {
    const stored = { _id: account._id, phone: PHONE, passwordSetBy: 'user' };
    vi.mocked(EmcrAccount.findOneAndUpdate).mockReturnValue({ lean: vi.fn().mockResolvedValue(stored) } as any);
    await consumeAccountOtp(PHONE, '123456');
    expect(cancelClinicPassword).not.toHaveBeenCalled();
  });
});
