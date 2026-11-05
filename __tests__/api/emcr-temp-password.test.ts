import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/api/tenant-session', () => ({
  requireTenantSession: vi.fn(),
  isTenantSessionError: () => false,
  isValidId: () => true,
  notFound: vi.fn(),
  patientTenantFilter: (tenantId: unknown) => ({ tenantIds: tenantId }),
}));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/EmcrInvite', () => ({ default: {} }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), findById: vi.fn() } }));
vi.mock('@/lib/patient-family', () => ({ FAMILY_RELATIONSHIPS: ['child'], isMinor: vi.fn(), personRecordIds: vi.fn() }));
vi.mock('@/app/api/patients/auth/shared', () => ({ maskPhone: (p: string) => p, phoneVariants: (p: string) => [p] }));
vi.mock('@/lib/emcr/login-id', () => ({ fullLoginId: () => null }));
vi.mock('@/lib/emcr/password', () => ({ generateTempPassword: () => 'temp-pass-1', setAccountPassword: vi.fn() }));
vi.mock('@/lib/emcr/invite', () => ({
  findUsableInvite: vi.fn().mockResolvedValue({ ok: true, invite: {} }),
  formatInviteCode: (c: string) => c,
  INVITE_TTL_DAYS: 7,
  inviteLink: () => 'link',
  issueInvite: vi.fn().mockResolvedValue({ code: 'CODE', expiresAt: new Date() }),
  redeemInvite: vi.fn(),
  revokeInvites: vi.fn(),
  sendInviteSms: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));

import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { redeemInvite, revokeInvites } from '@/lib/emcr/invite';
import { setAccountPassword } from '@/lib/emcr/password';
import { POST } from '@/app/api/patients/[id]/app-invite/route';

const CLINIC_A = new Types.ObjectId();
const CLINIC_B = new Types.ObjectId();
const PATIENT = new Types.ObjectId();
const ACCOUNT = new Types.ObjectId();
const PHONE = '+639171234567';

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

function call(body: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/patients/${PATIENT}/app-invite`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: String(PATIENT) }) });
}

const self = { mode: 'self', channel: 'print', tempPassword: true };
const guardian = { mode: 'guardian', channel: 'print', phone: PHONE, tempPassword: true };

describe('POST /api/patients/[id]/app-invite with a temporary password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: 'u', email: 'a@b.c', role: 'admin' },
      tenantId: String(CLINIC_A),
      tenantObjectId: CLINIC_A,
    } as any);
    const patient = { _id: PATIENT, firstName: 'A', phone: PHONE, active: true };
    vi.mocked(Patient.findOne).mockReturnValue({ ...selectLean(patient), ...lean(patient) } as any);
    vi.mocked(EmcrAccount.findOneAndUpdate).mockReturnValue(lean({ _id: ACCOUNT, phone: PHONE }) as any);
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ loginId: 'x' }) as any);
    vi.mocked(redeemInvite).mockResolvedValue({ ok: true, accountId: ACCOUNT });
  });

  const existing = (account: unknown) => vi.mocked(EmcrAccount.findOne).mockReturnValue(lean(account) as any);

  it('starts a new account tied to this clinic, without phone-proven linking', async () => {
    existing(null);
    const res = await call(self);
    expect(res.status).toBe(200);
    expect(vi.mocked(redeemInvite).mock.calls[0][2]).toEqual({ phoneProven: false });
    expect(setAccountPassword).toHaveBeenCalledWith(ACCOUNT, 'temp-pass-1', 'staff', CLINIC_A);
  });

  it.each([
    ['a phone-proven account with no password', { _id: ACCOUNT, phone: PHONE, selfPatientId: new Types.ObjectId() }],
    ['the temporary password of another clinic', { _id: ACCOUNT, phone: PHONE, passwordSetBy: 'staff', passwordTenantId: CLINIC_B }],
    ['a temporary password from before clinics were recorded', { _id: ACCOUNT, phone: PHONE, passwordSetBy: 'staff' }],
    ['a password the holder chose', { _id: ACCOUNT, phone: PHONE, passwordSetBy: 'user' }],
  ])('refuses to overwrite %s, in either mode', async (_name, account) => {
    existing(account);
    for (const body of [self, guardian]) {
      const res = await call(body);
      expect(res.status).toBe(409);
      expect(await res.json()).not.toHaveProperty('data');
    }
    expect(setAccountPassword).not.toHaveBeenCalled();
    expect(redeemInvite).not.toHaveBeenCalled();
    expect(revokeInvites).toHaveBeenCalledTimes(2);
  });

  it('reissues the temporary password of this clinic', async () => {
    existing({ _id: ACCOUNT, phone: PHONE, passwordSetBy: 'staff', passwordTenantId: CLINIC_A });
    const res = await call(self);
    expect(res.status).toBe(200);
    expect(setAccountPassword).toHaveBeenCalledWith(ACCOUNT, 'temp-pass-1', 'staff', CLINIC_A);
  });
});
