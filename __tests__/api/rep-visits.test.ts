import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({
  isAdmin: (s: { role?: string }) => s.role === 'admin' || s.role === 'owner',
  refuseAccess: vi.fn(async () => NextResponse.json({ success: false }, { status: 403 })),
}));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/lib/rep-visits', () => ({
  CLINIC_HIDDEN_VISIT_FIELDS: '-notes',
  VISIT_REP_FIELDS: 'firstName',
  VISIT_PRODUCT_FIELDS: 'name',
  getClinicForReps: vi.fn(),
  slotRemaining: vi.fn(),
  notifyRepOfVisit: vi.fn(),
  bumpRepMetrics: vi.fn(),
}));

import { Types } from 'mongoose';
import { requireTenantSession } from '@/lib/api/tenant-session';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { getClinicForReps, slotRemaining, notifyRepOfVisit, bumpRepMetrics } from '@/lib/rep-visits';
import { PATCH } from '@/app/api/rep-visits/[id]/route';

const TENANT = '507f1f77bcf86cd7994390cc';
const VISIT = '507f1f77bcf86cd7994390dd';
const REP = '507f1f77bcf86cd7994390ee';

const asRole = (role: string) =>
  vi.mocked(requireTenantSession).mockResolvedValue({
    session: { userId: '507f1f77bcf86cd7994390ff', role, tenantId: TENANT } as any,
    tenantId: TENANT,
    tenantObjectId: new Types.ObjectId(TENANT),
  });

/** findOne is used for the current status (select → lean) and the reply (select → populate → populate → lean). */
function current(visit: Record<string, unknown> | null) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.populate = vi.fn(() => chain);
  chain.lean = vi.fn().mockResolvedValue(visit);
  vi.mocked(MedicalRepresentativeVisit.findOne).mockReturnValue(chain);
}
const updated = (visit: Record<string, unknown> | null) =>
  vi.mocked(MedicalRepresentativeVisit.findOneAndUpdate).mockReturnValue({ lean: vi.fn().mockResolvedValue(visit) } as any);

const patch = (body: unknown) =>
  PATCH(new NextRequest(`http://x/api/rep-visits/${VISIT}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: VISIT }),
  });

const REQUESTED = { _id: VISIT, status: 'requested', date: new Date('2026-11-03T00:00:00Z'), time: '15:00', medicalRepresentativeId: REP };

describe('PATCH /api/rep-visits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole('admin');
    vi.mocked(getClinicForReps).mockResolvedValue({ id: TENANT } as any);
    vi.mocked(slotRemaining).mockResolvedValue(1);
  });

  it('approves a request, adds the rep to the clinic and tells them', async () => {
    current(REQUESTED);
    updated({ ...REQUESTED, status: 'scheduled' });
    const res = await patch({ action: 'approve', note: 'Front desk, 2nd floor' });
    expect(res.status).toBe(200);
    const [filter, update] = vi.mocked(MedicalRepresentativeVisit.findOneAndUpdate).mock.calls[0] as any;
    expect(filter.status).toBe('requested');
    expect(update.$set).toMatchObject({ status: 'scheduled', clinicNote: 'Front desk, 2nd floor' });
    expect(MedicalRepresentative.updateOne).toHaveBeenCalledWith({ _id: REP }, { $addToSet: { tenantIds: expect.any(Types.ObjectId) } });
    expect(notifyRepOfVisit).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }), 'approved', 'Front desk, 2nd floor');
  });

  it('asks before approving into a full slot, and approves with override', async () => {
    current(REQUESTED);
    vi.mocked(slotRemaining).mockResolvedValue(0);
    const res = await patch({ action: 'approve' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SLOT_FULL');
    expect(MedicalRepresentativeVisit.findOneAndUpdate).not.toHaveBeenCalled();

    updated({ ...REQUESTED, status: 'scheduled' });
    expect((await patch({ action: 'approve', override: true })).status).toBe(200);
  });

  it('refuses a transition the status does not allow', async () => {
    current({ ...REQUESTED, status: 'completed' });
    const res = await patch({ action: 'decline' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('INVALID_TRANSITION');
  });

  it('completing counts toward the rep’s metrics and checks them in if staff forgot', async () => {
    current({ ...REQUESTED, status: 'scheduled' });
    updated({ ...REQUESTED, status: 'completed' });
    expect((await patch({ action: 'complete' })).status).toBe(200);
    const [, update] = vi.mocked(MedicalRepresentativeVisit.findOneAndUpdate).mock.calls[0] as any;
    expect(update.$set.checkedInAt).toBeInstanceOf(Date);
    expect(bumpRepMetrics).toHaveBeenCalledWith(REP, 'completed');
  });

  it('409s when the rep changed the visit at the same moment', async () => {
    current(REQUESTED);
    updated(null);
    const res = await patch({ action: 'decline' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('VISIT_CHANGED');
  });

  it('is for admins only', async () => {
    asRole('nurse');
    expect((await patch({ action: 'approve' })).status).toBe(403);
  });
});
