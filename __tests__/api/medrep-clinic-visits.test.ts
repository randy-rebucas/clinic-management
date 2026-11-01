import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/app/api/medical-representatives/_lib/rep-visit-input', async (orig) => ({
  ...(await orig<typeof import('@/app/api/medical-representatives/_lib/rep-visit-input')>()),
  loadRepProfileForVisits: vi.fn(),
  resolveVisitProducts: vi.fn(),
}));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { exists: vi.fn(), create: vi.fn() } }));
vi.mock('@/lib/rep-visits', () => ({
  getClinicForReps: vi.fn(),
  repMayBook: vi.fn(),
  slotRemaining: vi.fn(),
  notifyClinicOfVisit: vi.fn(),
}));
vi.mock('@/lib/rep-billing', () => ({ repBookingAccess: vi.fn() }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { loadRepProfileForVisits, resolveVisitProducts } from '@/app/api/medical-representatives/_lib/rep-visit-input';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { getClinicForReps, repMayBook, slotRemaining, notifyClinicOfVisit } from '@/lib/rep-visits';
import { repBookingAccess } from '@/lib/rep-billing';
import { POST } from '@/app/api/medical-representatives/visits/route';

const CLINIC = '507f1f77bcf86cd7994390cc';
const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const BODY = { clinicId: CLINIC, purpose: 'New antihypertensive', date: '2026-11-03', time: '15:00' };

const post = (body: unknown) =>
  POST(new NextRequest('http://x/api/medical-representatives/visits', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/medical-representatives/visits with a clinic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(resolveVisitProducts).mockResolvedValue(undefined);
    vi.mocked(loadRepProfileForVisits).mockResolvedValue({ _id: new Types.ObjectId(), firstName: 'Ana', lastName: 'Cruz', company: 'Acme Pharma' } as any);
    vi.mocked(getClinicForReps).mockResolvedValue({ id: CLINIC, name: 'Sunrise Clinic', location: 'Makati', timezone: 'Asia/Manila', settings: { slotMinutes: 15 } } as any);
    vi.mocked(repMayBook).mockReturnValue({ allowed: true, linked: true });
    vi.mocked(repBookingAccess).mockResolvedValue({ ok: true, via: 'free' });
    vi.mocked(slotRemaining).mockResolvedValue(2);
    vi.mocked(MedicalRepresentativeVisit.exists).mockResolvedValue(null);
    vi.mocked(MedicalRepresentativeVisit.create).mockImplementation(async (doc: any) => ({ _id: 'v1', ...doc }));
  });

  it('creates a request with the clinic’s details and tells the clinic', async () => {
    const res = await post({ ...BODY, clinicName: 'ignored', status: 'completed' });
    expect(res.status).toBe(200);
    const doc = vi.mocked(MedicalRepresentativeVisit.create).mock.calls[0][0] as any;
    expect(doc).toMatchObject({ clinicName: 'Sunrise Clinic', clinicLocation: 'Makati', status: 'requested', duration: 15, time: '15:00' });
    expect(String(doc.clinicId)).toBe(CLINIC);
    expect(notifyClinicOfVisit).toHaveBeenCalledWith(expect.anything(), 'requested', { name: 'Ana Cruz', company: 'Acme Pharma' });
  });

  it('402 without a subscription when booking is paid', async () => {
    vi.mocked(repBookingAccess).mockResolvedValue({ ok: false });
    const res = await post(BODY);
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('404 for a clinic the rep may not book', async () => {
    vi.mocked(repMayBook).mockReturnValue({ allowed: false, linked: false });
    expect((await post(BODY)).status).toBe(404);
  });

  it('refuses a time outside the clinic’s hours, a full slot and a second visit that day', async () => {
    vi.mocked(slotRemaining).mockResolvedValueOnce(null);
    expect(await (await post(BODY)).json()).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    vi.mocked(slotRemaining).mockResolvedValueOnce(0);
    expect(await (await post(BODY)).json()).toMatchObject({ code: 'SLOT_FULL' });
    vi.mocked(MedicalRepresentativeVisit.exists).mockResolvedValueOnce({ _id: 'x' } as any);
    expect(await (await post(BODY)).json()).toMatchObject({ code: 'DUPLICATE_REQUEST' });
    expect(MedicalRepresentativeVisit.create).not.toHaveBeenCalled();
  });

  it('needs a plain YYYY-MM-DD date', async () => {
    expect((await post({ ...BODY, date: '2026-11-03T15:00:00Z' })).status).toBe(400);
  });
});
