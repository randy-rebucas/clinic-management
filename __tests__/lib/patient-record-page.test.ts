import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/notify', () => ({ STAFF_SENDER_ROLES: ['admin', 'owner', 'doctor'] }));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ getPermissionChecker: vi.fn(), denyPage: vi.fn(), isAdmin: vi.fn() }));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }));

import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import User from '@/models/User';
import { isCertifyingDoctor } from '@/lib/doctor-access';
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

describe('who issues medical certificates (isCertifyingDoctor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findOne).mockReturnValue(userQuery());
  });

  it('doctors, without a lookup', async () => {
    expect(await isCertifyingDoctor({ role: 'doctor', tenantId: TENANT, userId: USER })).toBe(true);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('other logins linked to a doctor profile at the clinic (an owner who practises)', async () => {
    vi.mocked(User.findOne).mockReturnValue(userQuery('507f1f77bcf86cd7994390dd'));
    expect(await isCertifyingDoctor({ role: 'owner', tenantId: TENANT, userId: USER })).toBe(true);
    expect((vi.mocked(User.findOne).mock.calls as any)[0][0]).toMatchObject({ _id: USER });
  });

  it('not other staff, nor a login outside a clinic', async () => {
    for (const role of ['nurse', 'receptionist', 'admin']) {
      expect(await isCertifyingDoctor({ role, tenantId: TENANT, userId: USER })).toBe(false);
    }
    expect(await isCertifyingDoctor({ role: 'owner', userId: USER })).toBe(false);
  });
});

describe('the patient page’s Medical certificate button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findOne).mockReturnValue(userQuery());
  });

  it('shows for doctors who can read visits', async () => {
    signIn('doctor');
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(true);
  });

  it('is hidden from other staff, and from a doctor whose role can’t read visits', async () => {
    signIn('nurse');
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(false);
    signIn('doctor', ['patients:read']);
    expect((await loadPatientRecordPermissions()).canIssueCertificate).toBe(false);
  });
});
