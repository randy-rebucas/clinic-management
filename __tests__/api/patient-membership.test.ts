import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Membership', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import Patient from '@/models/Patient';
import Membership from '@/models/Membership';
import Tenant from '@/models/Tenant';
import { GET } from '@/app/api/patients/me/membership/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439012';

const patientQuery = (patient: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(patient) }) });
const chain = (rows: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(rows) };
  q.select = vi.fn().mockReturnValue(q);
  return q;
};
const get = () => GET(new NextRequest('http://localhost/api/patients/me/membership'));

const goldAtA = {
  _id: new Types.ObjectId(),
  tenantId: new Types.ObjectId(TENANT_A),
  membershipNumber: 'MEM-000042',
  tier: 'gold',
  status: 'active',
  points: 120,
  totalPointsEarned: 200,
  totalPointsRedeemed: 80,
  discountPercentage: 15,
  benefits: ['points_earn', 'priority_booking'],
  joinDate: new Date('2026-01-10T00:00:00Z'),
  expiryDate: new Date('2099-06-01T00:00:00Z'),
  transactions: [
    { type: 'earn', points: 200, description: 'Visit', createdAt: new Date('2026-02-01T00:00:00Z') },
    { type: 'redeem', points: 80, description: 'Redeemed', createdAt: new Date('2026-03-01T00:00:00Z') },
  ],
};

describe('patient membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, tenantIds: [TENANT_A, TENANT_B] }) as any);
    vi.mocked(Tenant.find).mockReturnValue(
      chain([
        { _id: new Types.ObjectId(TENANT_A), name: 'a', displayName: 'Clinic A' },
        { _id: new Types.ObjectId(TENANT_B), name: 'Clinic B' },
      ])
    );
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('403 for an inactive account', async () => {
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, active: false }) as any);
    expect((await get()).status).toBe(403);
    expect(Membership.find).not.toHaveBeenCalled();
  });

  it("returns one card per clinic, only the patient's own at their clinics, best tier first", async () => {
    vi.mocked(Membership.find).mockReturnValue(
      chain([
        { ...goldAtA, _id: new Types.ObjectId(), tenantId: new Types.ObjectId(TENANT_B), tier: 'bronze', discountPercentage: 5, transactions: [], notes: 'staff only' },
        { ...goldAtA, notes: 'staff only', referrals: [new Types.ObjectId()] },
      ])
    );
    const res = await get();
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect((vi.mocked(Membership.find).mock.calls[0] as unknown[])[0]).toEqual({
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [new Types.ObjectId(TENANT_A), new Types.ObjectId(TENANT_B)] },
    });
    expect(data.map((m: any) => m.clinicName)).toEqual(['Clinic A', 'Clinic B']);
    expect(data[0]).toMatchObject({
      tenantId: TENANT_A,
      membershipNumber: 'MEM-000042',
      tier: 'gold',
      tierLabel: 'Gold',
      points: 120,
      discountPercentage: 15,
      discountActive: true,
      benefits: ['Earns points', 'Priority booking'],
    });
    // Newest points first.
    expect(data[0].history.map((h: any) => [h.type, h.points])).toEqual([['redeem', -80], ['earn', 200]]);
    expect(JSON.stringify(data)).not.toContain('staff only');
    expect(data[0]).not.toHaveProperty('referrals');
  });

  it('an expired membership gives no discount', async () => {
    vi.mocked(Membership.find).mockReturnValue(chain([{ ...goldAtA, expiryDate: new Date('2025-01-01T00:00:00Z') }]));
    const { data } = await (await get()).json();
    expect(data[0]).toMatchObject({ state: 'expired', discountActive: false });
  });

  it('a session bound to one clinic sees only that clinic', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', tid: TENANT_B } as any);
    vi.mocked(Membership.find).mockReturnValue(chain([]));
    await get();
    expect(((vi.mocked(Membership.find).mock.calls[0] as unknown[])[0] as any).tenantId).toEqual({ $in: [new Types.ObjectId(TENANT_B)] });
  });

  it('an empty list when there is no membership or no clinic', async () => {
    vi.mocked(Membership.find).mockReturnValue(chain([]));
    expect((await (await get()).json()).data).toEqual([]);

    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, tenantIds: [] }) as any);
    vi.mocked(Membership.find).mockClear();
    expect((await (await get()).json()).data).toEqual([]);
    expect(Membership.find).not.toHaveBeenCalled();
  });
});
