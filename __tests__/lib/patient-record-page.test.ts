import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/notify', () => ({ STAFF_SENDER_ROLES: ['admin', 'owner', 'doctor'] }));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({
  getPermissionChecker: vi.fn(),
  denyPage: vi.fn(),
  isAdmin: (s: { role?: string } | null) => s?.role === 'admin' || s?.role === 'owner',
}));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }));

import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import User from '@/models/User';
import { canIssueMedicalCertificates } from '@/lib/doctor-access';
import { loadPatientRecordPermissions } from '@/lib/patient-record-page';

const TENANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439099';

const userQuery = (doctorProfile?: string) => {
  const q: any = { lean: vi.fn().mockResolvedValue(doctorProfile === undefined ? null : { doctorProfile }) };
  q.select = vi.fn().mockReturnValue(q);
  return q;
};

function signIn(role: string, granted: string[] = ['patients:read', 'visits:read']) {
  vi.mocked(verifySession).mockResolvedValue({ userId: USER, role, tenantId: TENANT } as any);
  vi.mocked(getPermissionChecker).mockResolvedValue(((resource: string, action: string) => granted.includes(`${resource}:${action}`)) as any);
}

describe('who issues medical certificates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findOne).mockReturnValue(userQuery());
  });

  it('doctors, admins and owners, without a lookup', async () => {
    for (const role of ['doctor', 'admin', 'owner']) {
      expect(await canIssueMedicalCertificates({ role, tenantId: TENANT, userId: USER })).toBe(true);
    }
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('other logins linked to a doctor profile at the clinic', async () => {
    vi.mocked(User.findOne).mockReturnValue(userQuery('507f1f77bcf86cd7994390dd'));
    expect(await canIssueMedicalCertificates({ role: 'nurse', tenantId: TENANT, userId: USER })).toBe(true);
    expect((vi.mocked(User.findOne).mock.calls as any)[0][0]).toMatchObject({ _id: USER });
  });

  it('not other staff, nor a login outside a clinic', async () => {
    for (const role of ['nurse', 'receptionist', 'accountant', 'medical-technologist']) {
      expect(await canIssueMedicalCertificates({ role, tenantId: TENANT, userId: USER })).toBe(false);
    }
    expect(await canIssueMedicalCertificates({ role: 'nurse', userId: USER })).toBe(false);
  });
});

describe('the patient page’s Medical certificate button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findOne).mockReturnValue(userQuery());
  });

  it('shows for doctors and admins who can read visits', async () => {
    signIn('doctor');
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(true);
    signIn('admin');
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(true);
  });

  it('is hidden from other staff, and from a doctor whose role can’t read visits', async () => {
    signIn('nurse');
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(false);
    signIn('doctor', ['patients:read']);
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(false);
  });
});
