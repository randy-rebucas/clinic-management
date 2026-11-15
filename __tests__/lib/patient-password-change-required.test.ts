import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findById: vi.fn(), findOne: vi.fn() } }));
vi.mock('@/models/EmcrAccessRequest', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(0) } }));
vi.mock('@/models/RefreshToken', () => ({
  default: { create: vi.fn(), findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateMany: vi.fn() },
}));

import { decodeJwt } from 'jose';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import RefreshToken from '@/models/RefreshToken';
import { issuePatientToken, verifyPatientSession } from '@/app/lib/dal';
import { consumeRefreshToken } from '@/app/lib/refresh-tokens';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { accountSessionFields } from '@/lib/emcr/session';
import { GET as getAccount } from '@/app/api/emcr/account/route';
import { GET as getMe } from '@/app/api/patients/me/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const ACCOUNT_ID = '507f1f77bcf86cd799439044';
const TENANT = '507f1f77bcf86cd799439011';
const PHONE = '+639171234567';
const subject = { _id: PATIENT_ID, patientCode: 'P-1', email: 'p@x.y', sessionVersion: 0 };

/** A query chain: .select()/.limit() return it, .lean() and await give `value`. */
function chain(value: unknown) {
  const q: any = {
    select: () => q,
    limit: () => q,
    lean: () => Promise.resolve(value),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
}

const tempAccount = {
  _id: ACCOUNT_ID,
  phone: PHONE,
  selfPatientId: PATIENT_ID,
  passwordSetAt: new Date(),
  passwordSetBy: 'staff' as const,
  mustChangePassword: true,
  passwordTenantId: TENANT,
};

const bearer = (token: string, url = 'http://localhost/api/patients/me') =>
  new NextRequest(url, { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Patient.findById).mockImplementation((() =>
    chain({ ...subject, active: true, phone: PHONE, firstName: 'Ana', lastName: 'Cruz' })) as any);
  vi.mocked(EmcrAccount.findById).mockImplementation((() => chain({ ...tempAccount, sessionVersion: 0 })) as any);
});

describe('pending password change claim (pwc)', () => {
  it('round-trips on a token with an account, and is never signed without one', async () => {
    const withAccount = await verifyPatientSession(await issuePatientToken(subject, { acc: ACCOUNT_ID, pwc: true }));
    expect(withAccount?.pwc).toBe(true);
    const without = decodeJwt(await issuePatientToken(subject, { pwc: true }));
    expect(without.pwc).toBeUndefined();
  });

  it('password sign-in with the clinic temporary password marks the token and its refresh chain', async () => {
    const fields = await accountSessionFields(tempAccount as any, 'password');
    expect(fields?.passwordChangeRequired).toBe(true);
    expect(decodeJwt(fields!.token as string)).toMatchObject({ pwc: true, acc: ACCOUNT_ID, tid: TENANT });
    expect(vi.mocked(RefreshToken.create).mock.calls[0][0]).toMatchObject({ scopePasswordChange: true });
  });

  it('own password or SMS-code sign-ins carry no claim', async () => {
    const own = await accountSessionFields({ ...tempAccount, mustChangePassword: false, passwordSetBy: 'user' } as any, 'password');
    expect(own?.passwordChangeRequired).toBe(false);
    expect(decodeJwt(own!.token as string).pwc).toBeUndefined();
    const otp = await accountSessionFields(tempAccount as any, 'otp');
    expect(decodeJwt(otp!.token as string).pwc).toBeUndefined();
    for (const [row] of vi.mocked(RefreshToken.create).mock.calls) expect((row as any).scopePasswordChange).toBeUndefined();
  });

  it('a refresh token row hands the claim back to the refresh route', async () => {
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(
      chain({ subjectId: PATIENT_ID, sessionVersion: 0, family: 'f', scopeAccountId: ACCOUNT_ID, scopePasswordChange: true }) as any
    );
    const consumed = await consumeRefreshToken('a'.repeat(43), 'patient');
    expect(consumed).toMatchObject({ ok: true, value: { acc: ACCOUNT_ID, pwc: true } });
  });

  it('verifyPatientAuth refuses the session with 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const token = await issuePatientToken(subject, { acc: ACCOUNT_ID, pwc: true });
    const request = bearer(token);
    expect(await verifyPatientAuth(request)).toBeNull();
    const res = patientAuthError(request);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      error: expect.any(String),
    });
    // Also with profile modes and family headers: the claim wins.
    expect(await verifyPatientAuth(bearer(token), { profile: 'ignore' })).toBeNull();
  });

  it('lets the session through where the change is completed', async () => {
    const token = await issuePatientToken(subject, { acc: ACCOUNT_ID, pwc: true });
    const session = await verifyPatientAuth(bearer(token), { profile: 'ignore', allowPendingPasswordChange: true });
    expect(session).toMatchObject({ patientId: PATIENT_ID, pwc: true });
  });

  it('GET /api/patients/me is refused, GET /api/emcr/account answers (with mustChangePassword)', async () => {
    const token = await issuePatientToken(subject, { acc: ACCOUNT_ID, pwc: true });
    const me = await getMe(bearer(token));
    expect(me.status).toBe(403);
    expect((await me.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

    const account = await getAccount(bearer(token, 'http://localhost/api/emcr/account'));
    expect(account.status).toBe(200);
    expect((await account.json()).data).toMatchObject({ mustChangePassword: true });
  });

  it('a token without the claim is unaffected', async () => {
    const token = await issuePatientToken(subject, { acc: ACCOUNT_ID });
    expect(await verifyPatientAuth(bearer(token))).toMatchObject({ patientId: PATIENT_ID });
  });
});
