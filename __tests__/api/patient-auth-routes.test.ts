import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  rateLimiters: { api: {}, auth: {}, authAccount: {}, otpSend: {} },
}));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({ default: { updateOne: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/app/lib/refresh-tokens', () => ({
  consumeRefreshToken: vi.fn(),
  issueRefreshToken: vi.fn().mockResolvedValue('new-refresh'),
  revokeRefreshFamily: vi.fn(),
  revokeRefreshToken: vi.fn(),
  findRefreshTokenSubject: vi.fn(),
  readRefreshTokenFromBody: async (request: Request) => {
    const text = await request.text();
    return text ? JSON.parse(text).refreshToken : undefined;
  },
  REFRESH_TOKEN_TTL_SECONDS: 5184000,
}));
vi.mock('@/app/lib/dal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/dal')>();
  return { ...actual, issuePatientToken: vi.fn().mockResolvedValue('new-access') };
});
vi.mock('@/app/api/patients/auth/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/patients/auth/shared')>();
  return {
    ...actual,
    revokeAllPatientAccess: vi.fn(),
    checkPhoneProof: vi.fn(),
    rotatePatientSessionAfterPasswordChange: vi.fn(async () => ({
      apply: (r: any) => r,
      token: 'rotated',
      bodyFields: { token: 'rotated', expiresIn: 604800 },
    })),
  };
});

import bcrypt from 'bcryptjs';
import Patient from '@/models/Patient';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { issuePatientToken } from '@/app/lib/dal';
import {
  consumeRefreshToken,
  findRefreshTokenSubject,
  issueRefreshToken,
  revokeRefreshToken,
} from '@/app/lib/refresh-tokens';
import {
  checkPhoneProof,
  revokeAllPatientAccess,
  rotatePatientSessionAfterPasswordChange,
} from '@/app/api/patients/auth/shared';
import { POST as refresh } from '@/app/api/patients/auth/refresh/route';
import { POST as changePassword } from '@/app/api/patients/me/change-password/route';
import { DELETE as signOut } from '@/app/api/patients/session/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const now = () => Math.floor(Date.now() / 1000);

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/patients/auth/refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  const patientDoc = (extra: Record<string, unknown> = {}) =>
    vi.mocked(Patient.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: PATIENT_ID, sessionVersion: 3, ...extra }),
    } as any);

  it('keeps the clinic scope (tid) of the original sign-in', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({
      ok: true,
      value: { subjectId: PATIENT_ID, sessionVersion: 3, family: 'fam', tid: TENANT_A },
    });
    patientDoc();
    const res = await refresh(post('/api/patients/auth/refresh', { refreshToken: 'x' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(issuePatientToken).mock.calls[0][1]).toEqual({ tid: TENANT_A });
    expect(vi.mocked(issueRefreshToken).mock.calls[0]).toEqual(['patient', PATIENT_ID, 3, 'fam', { tid: TENANT_A }]);
  });

  it('403 ACCOUNT_INACTIVE for a deactivated patient', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({
      ok: true,
      value: { subjectId: PATIENT_ID, sessionVersion: 3, family: 'fam' },
    });
    patientDoc({ active: false });
    const res = await refresh(post('/api/patients/auth/refresh', { refreshToken: 'x' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    expect(issuePatientToken).not.toHaveBeenCalled();
  });

  it('401 REFRESH_INVALID after a session version bump', async () => {
    vi.mocked(consumeRefreshToken).mockResolvedValue({
      ok: true,
      value: { subjectId: PATIENT_ID, sessionVersion: 2, family: 'fam' },
    });
    patientDoc();
    const res = await refresh(post('/api/patients/auth/refresh', { refreshToken: 'x' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'REFRESH_INVALID' });
  });
});

describe('POST /api/patients/me/change-password', () => {
  let hash: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    hash ??= await bcrypt.hash('old-password', 4);
  });

  const patientWith = (password?: string) =>
    vi.mocked(Patient.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: PATIENT_ID, password, active: true }),
    } as any);
  const as = (session: Record<string, unknown>) =>
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', ...session } as any);
  const call = (body: unknown) => changePassword(post('/api/patients/me/change-password', body));

  it('allows a reset without currentPassword right after an OTP sign-in', async () => {
    as({ amr: 'otp', iat: now() - 60 });
    patientWith(hash);
    const res = await call({ newPassword: 'brand-new-pw' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, token: 'rotated', expiresIn: 604800 });
    // Phone proven: the staff clinic scope is lifted and the new token is unscoped.
    expect((vi.mocked(Patient.updateOne).mock.calls[0] as any[])[1]).toMatchObject({ $unset: { passwordTenantId: 1 } });
    expect(vi.mocked(rotatePatientSessionAfterPasswordChange).mock.calls[0][2]).toMatchObject({ tid: undefined });
  });

  it('400 CURRENT_PASSWORD_REQUIRED when the OTP sign-in is older than 15 minutes', async () => {
    as({ amr: 'otp', iat: now() - 16 * 60 });
    patientWith(hash);
    const res = await call({ newPassword: 'brand-new-pw' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, code: 'CURRENT_PASSWORD_REQUIRED' });
    expect(Patient.updateOne).not.toHaveBeenCalled();
  });

  it('400 CURRENT_PASSWORD_REQUIRED for a password session without currentPassword', async () => {
    as({ amr: 'password', iat: now() });
    patientWith(hash);
    const res = await call({ newPassword: 'brand-new-pw' });
    expect(await res.json()).toMatchObject({ code: 'CURRENT_PASSWORD_REQUIRED' });
  });

  it('keeps WRONG_CURRENT_PASSWORD for a wrong one', async () => {
    as({ amr: 'password', iat: now() });
    patientWith(hash);
    const res = await call({ currentPassword: 'nope', newPassword: 'brand-new-pw' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'WRONG_CURRENT_PASSWORD' });
  });

  it('a QR session cannot set a first password without phone proof', async () => {
    as({ amr: 'qr', iat: now(), tid: TENANT_A });
    patientWith(undefined);
    const res = await call({ newPassword: 'brand-new-pw' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'OTP_REQUIRED' });
    expect(Patient.updateOne).not.toHaveBeenCalled();
  });

  it('a QR session can set a first password with a valid SMS code', async () => {
    as({ amr: 'qr', iat: now(), tid: TENANT_A });
    patientWith(undefined);
    vi.mocked(checkPhoneProof).mockResolvedValue({ ok: true, proven: true });
    const res = await call({ newPassword: 'brand-new-pw', otp: '123456' });
    expect(res.status).toBe(200);
    expect(checkPhoneProof).toHaveBeenCalled();
  });

  it('a correct current password keeps the session clinic scope', async () => {
    as({ amr: 'password', iat: now(), tid: TENANT_A });
    patientWith(hash);
    const res = await call({ currentPassword: 'old-password', newPassword: 'brand-new-pw', deviceId: 'dev-1' });
    expect(res.status).toBe(200);
    expect(vi.mocked(rotatePatientSessionAfterPasswordChange).mock.calls[0][2]).toEqual({
      tid: TENANT_A,
      keepDeviceId: 'dev-1',
    });
  });
});

describe('DELETE /api/patients/session', () => {
  beforeEach(() => vi.clearAllMocks());
  const del = (query: string, body?: unknown) =>
    signOut(
      new NextRequest(`http://localhost/api/patients/session${query}`, {
        method: 'DELETE',
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    );

  it('signs out everywhere with an expired access token but a live refresh token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    vi.mocked(findRefreshTokenSubject).mockResolvedValue({ subjectId: PATIENT_ID, sessionVersion: 4 });
    vi.mocked(Patient.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ sessionVersion: 4 }) }),
    } as any);
    const res = await del('?all=true&deviceId=dev-1', { refreshToken: 'r' });
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith('r', 'patient');
    expect(revokeAllPatientAccess).toHaveBeenCalledWith(PATIENT_ID);
  });

  it('401 when neither token identifies the patient', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    vi.mocked(findRefreshTokenSubject).mockResolvedValue(null);
    const res = await del('?all=true', { refreshToken: 'r' });
    expect(res.status).toBe(401);
    expect(revokeAllPatientAccess).not.toHaveBeenCalled();
  });

  it('a refresh token from an older session version does not authorize sign-out-everywhere', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    vi.mocked(findRefreshTokenSubject).mockResolvedValue({ subjectId: PATIENT_ID, sessionVersion: 1 });
    vi.mocked(Patient.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ sessionVersion: 4 }) }),
    } as any);
    expect((await del('?all=true', { refreshToken: 'r' })).status).toBe(401);
  });
});
