import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), recordPatientRefused: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: {} }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    PATIENT_PROFILE_HEADER: 'x-patient-profile',
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/patient-family', () => ({
  FAMILY_RELATIONSHIPS: ['child'],
  personRecordIds: vi.fn(async (id: unknown) => [new Types.ObjectId(String(id))]),
  removeDependent: vi.fn(),
  listDependents: vi.fn().mockResolvedValue([]),
  findFamilySuggestions: vi.fn().mockResolvedValue([]),
  addPhoneDependent: vi.fn(),
}));
vi.mock('@/lib/emcr/account', () => ({
  findAccountForSession: vi.fn(),
  forgetAccountCache: vi.fn(),
  listAccountDependents: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/api/patients/auth/shared', () => ({
  checkPhoneProof: vi.fn(),
  otpFailureResponse: vi.fn(),
  otpRequiredResponse: vi.fn(),
}));

import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { findFamilySuggestions, listDependents, removeDependent } from '@/lib/patient-family';
import { findAccountForSession, forgetAccountCache, listAccountDependents } from '@/lib/emcr/account';
import { DELETE } from '@/app/api/patients/me/family/[id]/route';
import { GET } from '@/app/api/patients/me/family/route';

const SELF = '507f1f77bcf86cd799439033';
const CHILD = '507f1f77bcf86cd799439044';
const ACCOUNT = '507f1f77bcf86cd799439055';
const TENANT = '507f1f77bcf86cd799439011';

const remove = (headers: Record<string, string> = {}) =>
  DELETE(new NextRequest(`http://localhost/api/patients/me/family/${CHILD}`, { method: 'DELETE', headers }), {
    params: Promise.resolve({ id: CHILD }),
  });

const selectLean = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Patient.findById).mockReturnValue(selectLean({ firstName: 'Ana', lastName: 'Cruz', active: true, tenantIds: [] }) as any);
  vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: SELF, acc: ACCOUNT, type: 'patient', email: 'a@b.c' } as any);
});

describe('DELETE /api/patients/me/family/[id]', () => {
  it('removes an account-level dependent (EmcrAccount.dependents) and clears the account cache', async () => {
    vi.mocked(removeDependent).mockResolvedValue(false);
    vi.mocked(findAccountForSession).mockResolvedValue({
      _id: new Types.ObjectId(ACCOUNT),
      dependents: [{ patientId: new Types.ObjectId(CHILD), source: 'phone_dob', addedAt: new Date() }],
    } as any);
    vi.mocked(EmcrAccount.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);

    const res = await remove();
    expect(res.status).toBe(200);
    const [filter, update] = vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[];
    expect(String(filter._id)).toBe(ACCOUNT);
    expect(update.$pull.dependents.patientId.$in.map(String)).toContain(CHILD);
    expect(forgetAccountCache).toHaveBeenCalled();
  });

  it('still removes a Patient.guardians link when the account has no dependents', async () => {
    vi.mocked(removeDependent).mockResolvedValue(true);
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: new Types.ObjectId(ACCOUNT), dependents: [] } as any);
    expect((await remove()).status).toBe(200);
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it('404 when neither kind of link exists', async () => {
    vi.mocked(removeDependent).mockResolvedValue(false);
    vi.mocked(findAccountForSession).mockResolvedValue({
      _id: new Types.ObjectId(ACCOUNT),
      dependents: [{ patientId: new Types.ObjectId(), source: 'clinic', addedAt: new Date() }],
    } as any);
    vi.mocked(EmcrAccount.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    expect((await remove()).status).toBe(404);
    expect(forgetAccountCache).not.toHaveBeenCalled();
  });

  it('a guardian-only session drops the account link only (never Patient.guardians of the record it sits on)', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: CHILD, acc: ACCOUNT, rel: 'guardian', type: 'patient' } as any);
    vi.mocked(findAccountForSession).mockResolvedValue({
      _id: new Types.ObjectId(ACCOUNT),
      dependents: [{ patientId: new Types.ObjectId(CHILD), source: 'clinic', addedAt: new Date() }],
    } as any);
    vi.mocked(EmcrAccount.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    expect((await remove()).status).toBe(200);
    expect(removeDependent).not.toHaveBeenCalled();
  });

  it('refuses when acting through a family profile', async () => {
    const res = await remove({ 'x-patient-profile': CHILD });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('NOT_FOR_FAMILY_PROFILE');
    expect(removeDependent).not.toHaveBeenCalled();
  });
});

describe('GET /api/patients/me/family clinic scope', () => {
  it('passes a clinic-scoped session tid to every list', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: SELF, acc: ACCOUNT, tid: TENANT, type: 'patient' } as any);
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: new Types.ObjectId(ACCOUNT), dependents: [] } as any);
    const res = await GET(new NextRequest('http://localhost/api/patients/me/family'));
    expect(res.status).toBe(200);
    expect(vi.mocked(listDependents).mock.calls[0][2]).toEqual({ tenantId: TENANT });
    expect(vi.mocked(findFamilySuggestions).mock.calls[0][2]).toEqual({ tenantId: TENANT });
    expect(vi.mocked(listAccountDependents).mock.calls[0][2]).toEqual({ tenantId: TENANT });
  });

  it('unscoped sessions see every clinic', async () => {
    vi.mocked(findAccountForSession).mockResolvedValue(null);
    await GET(new NextRequest('http://localhost/api/patients/me/family'));
    expect(vi.mocked(listDependents).mock.calls[0][2]).toEqual({ tenantId: undefined });
  });
});
