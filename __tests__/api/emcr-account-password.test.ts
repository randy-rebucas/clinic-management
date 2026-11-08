import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: { authAccount: {} } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/app/lib/patient-auth', () => ({ verifyPatientAuth: vi.fn(), patientAuthError: vi.fn() }));
vi.mock('@/app/lib/dal', () => ({
  isFreshOtpSession: vi.fn(),
  emcrAccountSessionVersion: vi.fn().mockResolvedValue(4),
  issuePatientToken: vi.fn().mockResolvedValue('guardian-token'),
  setPatientSessionCookie: vi.fn(),
  PATIENT_TOKEN_TTL_SECONDS: 60,
}));
vi.mock('@/app/lib/refresh-tokens', () => ({ issueRefreshToken: vi.fn().mockResolvedValue('guardian-refresh'), REFRESH_TOKEN_TTL_SECONDS: 60 }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/lib/emcr/account', () => ({ findAccountForSession: vi.fn() }));
vi.mock('@/lib/emcr/session', () => ({ accountView: vi.fn().mockResolvedValue({ id: 'view' }) }));
vi.mock('@/lib/emcr/password', () => ({
  accountPasswordMatches: vi.fn(),
  passwordProblem: vi.fn().mockReturnValue(null),
  replaceRecordPasswords: vi.fn(),
  setAccountPassword: vi.fn(),
  signOutOtherRecords: vi.fn(),
}));
vi.mock('@/app/api/patients/auth/shared', () => ({
  rotatePatientSessionAfterPasswordChange: vi.fn(async () => ({
    apply: (r: unknown) => r,
    token: 'rotated',
    bodyFields: { token: 'rotated', refreshToken: 'refresh' },
  })),
}));

import EmcrAccount from '@/models/EmcrAccount';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { isFreshOtpSession, issuePatientToken } from '@/app/lib/dal';
import { issueRefreshToken } from '@/app/lib/refresh-tokens';
import Patient from '@/models/Patient';
import { findAccountForSession } from '@/lib/emcr/account';
import { accountPasswordMatches, passwordProblem, replaceRecordPasswords, signOutOtherRecords } from '@/lib/emcr/password';
import { accountView } from '@/lib/emcr/session';
import { rotatePatientSessionAfterPasswordChange } from '@/app/api/patients/auth/shared';
import { POST } from '@/app/api/emcr/account/password/route';

const PATIENT = '507f1f77bcf86cd799439011';
const SELF = '507f1f77bcf86cd799439022';
const TENANT = '507f1f77bcf86cd799439033';

const call = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/emcr/account/password', { method: 'POST', body: JSON.stringify({ newPassword: 'brand-new-pw', ...body }) }));
const as = (session: Record<string, unknown>) =>
  vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT, type: 'patient', ...session } as any);
const account = (extra: Record<string, unknown> = {}) =>
  vi.mocked(findAccountForSession).mockResolvedValue({ _id: 'acc', phone: '+639171234567', selfPatientId: SELF, ...extra } as any);

describe('POST /api/emcr/account/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(EmcrAccount.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'acc' }) } as any);
    vi.mocked(isFreshOtpSession).mockReturnValue(false);
    vi.mocked(accountPasswordMatches).mockResolvedValue(true);
    vi.mocked(passwordProblem).mockReturnValue(null);
    vi.mocked(accountView).mockResolvedValue({ id: 'view' } as any);
  });

  it('without rotate, signs nobody out and returns no token (app versions up to 1.1.2)', async () => {
    as({});
    account({ passwordSetAt: new Date() });
    const res = await call({ currentPassword: 'old-password' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, account: { id: 'view' } });
    expect(rotatePatientSessionAfterPasswordChange).not.toHaveBeenCalled();
    expect(signOutOtherRecords).not.toHaveBeenCalled();
  });

  it('with rotate, signs other sessions out and returns the new tokens', async () => {
    as({ tid: TENANT, acc: 'acc' });
    account({ passwordSetAt: new Date() });
    const res = await call({ currentPassword: 'old-password', rotate: true, deviceId: ' dev-1 ' });
    expect(await res.json()).toMatchObject({ success: true, token: 'rotated', refreshToken: 'refresh' });
    expect(vi.mocked(signOutOtherRecords).mock.calls[0][2]).toEqual({ phoneProven: false });
    expect(vi.mocked(rotatePatientSessionAfterPasswordChange).mock.calls[0].slice(1)).toEqual([
      PATIENT,
      { tid: TENANT, keepDeviceId: 'dev-1', acc: 'acc' },
    ]);
  });

  it('proving the phone drops the clinic scope from the new token', async () => {
    vi.mocked(isFreshOtpSession).mockReturnValue(true);
    as({ tid: TENANT });
    account();
    await call({ rotate: true });
    expect(vi.mocked(rotatePatientSessionAfterPasswordChange).mock.calls[0][2]).toMatchObject({ tid: undefined });
  });

  it('never rotates a guardian-only session: it sits on a record it only manages', async () => {
    as({ rel: 'guardian', acc: 'acc' });
    account({ passwordSetAt: new Date(), selfPatientId: undefined });
    vi.mocked(Patient.findById).mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: PATIENT, sessionVersion: 2 }) } as any);
    const res = await call({ currentPassword: 'old-password', rotate: true });
    expect(res.status).toBe(200);
    expect(rotatePatientSessionAfterPasswordChange).not.toHaveBeenCalled();
    expect(signOutOtherRecords).not.toHaveBeenCalled();
    expect(replaceRecordPasswords).not.toHaveBeenCalled();
    // The password set ended the account's guardian sessions; this device gets a fresh one.
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toMatchObject({ acc: 'acc', rel: 'guardian', av: 4 });
    expect(vi.mocked(issueRefreshToken).mock.calls[0]).toEqual(['patient', PATIENT, 2, undefined, expect.objectContaining({ rel: 'guardian', av: 4 })]);
    expect(await res.json()).toMatchObject({ token: 'guardian-token', refreshToken: 'guardian-refresh' });
  });

  it("a change replaces the person's patient passwords", async () => {
    as({});
    account({ passwordSetAt: new Date() });
    await call({ currentPassword: 'old-password' });
    expect(vi.mocked(replaceRecordPasswords).mock.calls[0].slice(0, 2)).toEqual([SELF, 'brand-new-pw']);
  });

  it('a first password leaves them alone', async () => {
    vi.mocked(isFreshOtpSession).mockReturnValue(true);
    as({});
    account();
    await call({});
    expect(replaceRecordPasswords).not.toHaveBeenCalled();
  });

  it('a wrong current password changes nothing', async () => {
    vi.mocked(accountPasswordMatches).mockResolvedValue(false);
    as({});
    account({ passwordSetAt: new Date() });
    const res = await call({ currentPassword: 'wrong', rotate: true });
    expect(await res.json()).toMatchObject({ code: 'WRONG_CURRENT_PASSWORD' });
    expect(replaceRecordPasswords).not.toHaveBeenCalled();
    expect(rotatePatientSessionAfterPasswordChange).not.toHaveBeenCalled();
  });
});
