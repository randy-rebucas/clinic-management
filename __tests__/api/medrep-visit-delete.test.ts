import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { findOneAndDelete: vi.fn(), exists: vi.fn() } }));
vi.mock('@/models/RepDelivery', () => ({ default: { find: vi.fn() } }));
vi.mock('@/lib/rep-visits', () => ({
  getClinicForReps: vi.fn(),
  repMayBook: vi.fn(),
  slotRemaining: vi.fn(),
  notifyClinicOfVisit: vi.fn(),
}));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import RepDelivery from '@/models/RepDelivery';
import { DELETE } from '@/app/api/medical-representatives/visits/[id]/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const VISIT = '507f1f77bcf86cd7994390dd';
const deliveries = (rows: { status: string }[]) => {
  const q: any = { select: () => q, limit: () => q, lean: async () => rows };
  vi.mocked(RepDelivery.find).mockReturnValue(q);
};
const del = () => DELETE(new NextRequest(`http://x/api/medical-representatives/visits/${VISIT}`, { method: 'DELETE' }), { params: Promise.resolve({ id: VISIT }) });

describe('DELETE /api/medical-representatives/visits/[id] with deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(MedicalRepresentativeVisit.findOneAndDelete).mockReturnValue({ lean: async () => ({ _id: VISIT }) } as any);
    deliveries([]);
  });

  it('deletes a visit with no deliveries', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(MedicalRepresentativeVisit.findOneAndDelete).toHaveBeenCalled();
    expect((vi.mocked(RepDelivery.find).mock.calls[0] as unknown[])[0]).toEqual({ userId: USER, visitId: VISIT });
  });

  it('409 HAS_DELIVERIES while a delivery is pending, and deletes nothing', async () => {
    deliveries([{ status: 'received' }, { status: 'pending' }]);
    const res = await del();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, code: 'HAS_DELIVERIES', error: 'This visit has deliveries. Cancel them first.' });
    expect(MedicalRepresentativeVisit.findOneAndDelete).not.toHaveBeenCalled();
  });

  it('409 HAS_DELIVERIES for answered or cancelled deliveries too: they are the clinic’s record', async () => {
    deliveries([{ status: 'cancelled' }]);
    const res = await del();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: 'HAS_DELIVERIES' });
    expect(body.error).toMatch(/can’t be deleted/);
    expect(MedicalRepresentativeVisit.findOneAndDelete).not.toHaveBeenCalled();
  });
});
