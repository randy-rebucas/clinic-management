import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/app/lib/dal', () => ({ verifyPatientSession: vi.fn() }));

import Patient from '@/models/Patient';
import { verifyPatientSession } from '@/app/lib/dal';
import { adulthoodDate, canActFor, guardianshipActive, isMinor } from '@/lib/patient-family';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';

const GUARDIAN = '507f1f77bcf86cd799439011';
const CHILD = '507f1f77bcf86cd799439022';
const STRANGER = '507f1f77bcf86cd799439033';
const NOW = new Date('2026-10-19T00:00:00Z');

const lean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

function request(profile?: string) {
  const headers: Record<string, string> = { authorization: 'Bearer token' };
  if (profile) headers['x-patient-profile'] = profile;
  return new NextRequest('http://localhost/api/patients/me', { headers });
}

describe('family access rules', () => {
  it('a phone link lasts until the 18th birthday', () => {
    expect(adulthoodDate('2010-05-01')?.toISOString().slice(0, 10)).toBe('2028-05-01');
    expect(isMinor('2010-05-01', NOW)).toBe(true);
    expect(isMinor('2008-10-19', NOW)).toBe(false); // 18 today
    expect(isMinor('2008-10-20', NOW)).toBe(true);
    expect(isMinor(undefined, NOW)).toBe(false);
  });

  it('staff links never lapse; phone links lapse at adulthood', () => {
    expect(guardianshipActive({ source: 'clinic' }, '1950-01-01', NOW)).toBe(true);
    expect(guardianshipActive({ source: 'phone' }, '2015-01-01', NOW)).toBe(true);
    expect(guardianshipActive({ source: 'phone' }, '2000-01-01', NOW)).toBe(false);
  });
});

describe('canActFor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows a guardian listed on the dependent record and refuses anyone else', async () => {
    vi.mocked(Patient.findById).mockImplementation(((id: string) => {
      if (String(id) === GUARDIAN || String(id) === STRANGER) return lean({ _id: id, tenantIds: [] });
      return lean({ _id: CHILD, dateOfBirth: new Date('2016-01-01'), guardians: [{ patient: GUARDIAN, source: 'phone' }] });
    }) as any);

    expect(await canActFor(GUARDIAN, CHILD)).toBe(true);
    expect(await canActFor(STRANGER, CHILD)).toBe(false);
  });

  it('refuses acting for yourself through the header path', async () => {
    vi.mocked(Patient.findById).mockImplementation((() => lean({ _id: GUARDIAN, tenantIds: [] })) as any);
    expect(await canActFor(GUARDIAN, GUARDIAN)).toBe(false);
  });
});

describe('verifyPatientAuth with X-Patient-Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientSession).mockResolvedValue({ patientId: GUARDIAN, patientCode: 'P-1', type: 'patient', email: 'g@x.y', amr: 'otp' } as any);
  });

  it('answers for the signed-in person without the header', async () => {
    const session = await verifyPatientAuth(request());
    expect(session?.patientId).toBe(GUARDIAN);
    expect(session?.guardianId).toBeUndefined();
  });

  it('swaps in the family member and drops the fresh-OTP claim', async () => {
    const OTHER_CHILD = '507f1f77bcf86cd799439044';
    vi.mocked(Patient.findById).mockImplementation(((id: string) =>
      String(id) === GUARDIAN
        ? lean({ _id: GUARDIAN, tenantIds: [] })
        : lean({ _id: OTHER_CHILD, dateOfBirth: new Date('2018-01-01'), guardians: [{ patient: GUARDIAN, source: 'phone' }] })) as any);

    const session = await verifyPatientAuth(request(OTHER_CHILD));
    expect(session).toMatchObject({ patientId: OTHER_CHILD, guardianId: GUARDIAN });
    expect(session?.amr).toBeUndefined();
    expect(session?.tid).toBeUndefined();
  });

  it('a staff link only opens the clinic that made it', async () => {
    const ELDER = '507f1f77bcf86cd799439066';
    const CLINIC_A = '507f1f77bcf86cd7994390aa';
    const CLINIC_B = '507f1f77bcf86cd7994390bb';
    vi.mocked(Patient.findById).mockImplementation(((id: string) =>
      String(id) === GUARDIAN
        ? lean({ _id: GUARDIAN, tenantIds: [] })
        : lean({
            _id: ELDER,
            tenantIds: [CLINIC_A],
            dateOfBirth: new Date('1950-01-01'),
            guardians: [{ patient: GUARDIAN, source: 'clinic', tenantId: CLINIC_A }],
          })) as any);

    expect(await verifyPatientAuth(request(ELDER))).toMatchObject({ patientId: ELDER, tid: CLINIC_A });

    // A session already scoped to another clinic sees nothing of this person there.
    vi.mocked(verifyPatientSession).mockResolvedValue({ patientId: GUARDIAN, type: 'patient', tid: CLINIC_B } as any);
    const req = request(ELDER);
    expect(await verifyPatientAuth(req)).toBeNull();
    expect(patientAuthError(req).status).toBe(403);
  });

  it('a profile the caller does not manage is a 403, not a 401 (the app keeps its session)', async () => {
    const NOBODY = '507f1f77bcf86cd799439055';
    vi.mocked(Patient.findById).mockImplementation(((id: string) =>
      String(id) === GUARDIAN ? lean({ _id: GUARDIAN, tenantIds: [] }) : lean({ _id: NOBODY, guardians: [] })) as any);

    const req = request(NOBODY);
    expect(await verifyPatientAuth(req)).toBeNull();
    const res = patientAuthError(req);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PROFILE_FORBIDDEN');
  });

  it('refuse mode rejects any profile with NOT_FOR_FAMILY_PROFILE; ignore mode stays the signed-in person', async () => {
    const refused = request(CHILD);
    expect(await verifyPatientAuth(refused, { profile: 'refuse' })).toBeNull();
    expect((await patientAuthError(refused).json()).code).toBe('NOT_FOR_FAMILY_PROFILE');

    const ignored = await verifyPatientAuth(request(CHILD), { profile: 'ignore' });
    expect(ignored?.patientId).toBe(GUARDIAN);
  });

  it('no session is still a plain 401', async () => {
    vi.mocked(verifyPatientSession).mockResolvedValue(null);
    const req = request(CHILD);
    expect(await verifyPatientAuth(req)).toBeNull();
    expect(patientAuthError(req).status).toBe(401);
  });
});
