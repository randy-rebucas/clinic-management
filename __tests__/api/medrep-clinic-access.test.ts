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
}));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
  isTenantSessionError: () => false,
}));
vi.mock('@/app/lib/auth-helpers', () => ({
  isAdmin: vi.fn(() => true),
  refuseAccess: vi.fn(() => new Response(null, { status: 403 })),
}));
vi.mock('@/lib/rep-visits', async (orig) => ({ ...(await orig<typeof import('@/lib/rep-visits')>()), getClinicForReps: vi.fn() }));
vi.mock('@/lib/rep-access', () => ({
  notifyClinicOfAccessRequest: vi.fn(),
  notifyRepOfAccessAnswer: vi.fn(),
  notifyRepAddedByClinic: vi.fn(),
  notifyClinicRepLeft: vi.fn(),
}));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { countDocuments: vi.fn() } }));
vi.mock('@/models/RepAccessRequest', async (orig) => ({
  ...(await orig<typeof import('@/models/RepAccessRequest')>()),
  default: { exists: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/models', () => ({ MedicalRepresentative: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn() }, User: { findOne: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { loadRepProfileForVisits } from '@/app/api/medical-representatives/_lib/rep-visit-input';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { getClinicForReps } from '@/lib/rep-visits';
import { notifyClinicOfAccessRequest, notifyClinicRepLeft, notifyRepAddedByClinic, notifyRepOfAccessAnswer } from '@/lib/rep-access';
import RepAccessRequest from '@/models/RepAccessRequest';
import MedicalRepresentativeModel from '@/models/MedicalRepresentative';
import { MedicalRepresentative, User } from '@/models';
import { POST as requestAccess, DELETE as withdraw } from '@/app/api/medical-representatives/clinics/[id]/access/route';
import { PATCH as answer } from '@/app/api/rep-access-requests/[id]/route';
import { POST as addRep } from '@/app/api/medical-representatives/route';
import { DELETE as leave } from '@/app/api/medical-representatives/clinics/[id]/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const CLINIC = '507f1f77bcf86cd7994390cc';
const REP = new Types.ObjectId('507f1f77bcf86cd7994390bb');
const REQ = '507f1f77bcf86cd7994390ff';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) => new NextRequest('http://x', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const lean = <T,>(v: T) => ({ lean: async () => v, select: () => ({ lean: async () => v }), populate: async () => v });

describe('POST /api/medical-representatives/clinics/[id]/access', () => {
  const ask = (body: unknown = {}) => requestAccess(req('POST', body), ctx(CLINIC));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(getClinicForReps).mockResolvedValue({ id: CLINIC, name: 'Sunrise', settings: { enabled: true, openToAllReps: false } } as any);
    vi.mocked(loadRepProfileForVisits).mockResolvedValue({ _id: REP, firstName: 'Ana', lastName: 'Cruz', company: 'Acme Pharma', tenantIds: [] } as any);
    vi.mocked(RepAccessRequest.exists).mockResolvedValue(null);
    vi.mocked(RepAccessRequest.create).mockImplementation(async (doc: any) => ({ _id: REQ, ...doc }));
  });

  it('sends a request with the rep’s message and tells the clinic', async () => {
    const res = await ask({ message: 'New hypertension line' });
    expect(res.status).toBe(200);
    expect(vi.mocked(RepAccessRequest.create).mock.calls[0][0]).toMatchObject({ tenantId: CLINIC, medicalRepresentativeId: REP, userId: USER, repName: 'Ana Cruz', message: 'New hypertension line' });
    expect(notifyClinicOfAccessRequest).toHaveBeenCalledWith(CLINIC, REQ, { name: 'Ana Cruz', company: 'Acme Pharma' }, 'New hypertension line');
  });

  it('refuses when already linked, when open to all, when waiting, and soon after a decline', async () => {
    vi.mocked(loadRepProfileForVisits).mockResolvedValueOnce({ _id: REP, firstName: 'A', lastName: 'C', tenantIds: [new Types.ObjectId(CLINIC)] } as any);
    expect((await (await ask()).json()).code).toBe('ALREADY_LINKED');
    vi.mocked(getClinicForReps).mockResolvedValueOnce({ id: CLINIC, settings: { enabled: true, openToAllReps: true } } as any);
    expect((await (await ask()).json()).code).toBe('OPEN_CLINIC');
    vi.mocked(RepAccessRequest.exists).mockResolvedValueOnce({ _id: REQ } as any);
    expect((await (await ask()).json()).code).toBe('ALREADY_REQUESTED');
    vi.mocked(RepAccessRequest.exists).mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: REQ } as any);
    expect((await (await ask()).json()).code).toBe('RECENTLY_DECLINED');
    expect(RepAccessRequest.create).not.toHaveBeenCalled();
  });

  it('404 for a clinic not taking rep visits', async () => {
    vi.mocked(getClinicForReps).mockResolvedValueOnce({ id: CLINIC, settings: { enabled: false, openToAllReps: false } } as any);
    expect((await ask()).status).toBe(404);
  });

  it('a double tap lands once', async () => {
    vi.mocked(RepAccessRequest.create).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect((await (await ask()).json()).code).toBe('ALREADY_REQUESTED');
  });

  it('withdraws a waiting request', async () => {
    vi.mocked(RepAccessRequest.findOneAndUpdate).mockReturnValueOnce(lean({ _id: REQ }) as any);
    expect((await withdraw(req('DELETE'), ctx(CLINIC))).status).toBe(200);
    vi.mocked(RepAccessRequest.findOneAndUpdate).mockReturnValueOnce(lean(null) as any);
    expect((await withdraw(req('DELETE'), ctx(CLINIC))).status).toBe(404);
  });
});

describe('PATCH /api/rep-access-requests/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({ session: { userId: 'admin' }, tenantObjectId: new Types.ObjectId(CLINIC), tenantId: CLINIC } as any);
  });

  it('approve adds the rep to the clinic and tells them', async () => {
    vi.mocked(RepAccessRequest.findOneAndUpdate).mockReturnValueOnce(lean({ medicalRepresentativeId: REP }) as any);
    const res = await answer(req('PATCH', { action: 'approve' }), ctx(REQ));
    expect(res.status).toBe(200);
    expect(vi.mocked(RepAccessRequest.findOneAndUpdate).mock.calls[0][0]).toMatchObject({ status: 'pending' });
    expect(vi.mocked(MedicalRepresentativeModel.updateOne).mock.calls[0]).toEqual([{ _id: REP }, { $addToSet: { tenantIds: new Types.ObjectId(CLINIC) } }]);
    expect(notifyRepOfAccessAnswer).toHaveBeenCalledWith(REP, new Types.ObjectId(CLINIC), true, undefined);
  });

  it('decline leaves the rep out', async () => {
    vi.mocked(RepAccessRequest.findOneAndUpdate).mockReturnValueOnce(lean({ medicalRepresentativeId: REP }) as any);
    await answer(req('PATCH', { action: 'decline', note: 'Not now' }), ctx(REQ));
    expect(MedicalRepresentativeModel.updateOne).not.toHaveBeenCalled();
    expect(notifyRepOfAccessAnswer).toHaveBeenCalledWith(REP, new Types.ObjectId(CLINIC), false, 'Not now');
  });

  it('409 once answered', async () => {
    vi.mocked(RepAccessRequest.findOneAndUpdate).mockReturnValueOnce(lean(null) as any);
    vi.mocked(RepAccessRequest.exists).mockResolvedValueOnce({ _id: REQ } as any);
    expect((await (await answer(req('PATCH', { action: 'approve' }), ctx(REQ))).json()).code).toBe('REQUEST_CLOSED');
  });
});

describe('POST /api/medical-representatives (clinic adds a rep)', () => {
  const BODY = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@acme.test', phone: '09171234567' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({ session: { userId: 'admin' }, tenantObjectId: new Types.ObjectId(CLINIC), tenantId: CLINIC } as any);
  });

  it('links a rep who already has an account instead of refusing, and tells them', async () => {
    vi.mocked(MedicalRepresentative.findOne).mockReturnValueOnce(lean({ _id: REP, tenantIds: [new Types.ObjectId()] }) as any);
    vi.mocked(MedicalRepresentative.findOneAndUpdate).mockReturnValueOnce({ populate: async () => ({ _id: REP }) } as any);
    const res = await addRep(req('POST', BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.linked).toBe(true);
    expect(vi.mocked(MedicalRepresentative.findOneAndUpdate).mock.calls[0][1]).toEqual({ $addToSet: { tenantIds: new Types.ObjectId(CLINIC) } });
    expect(vi.mocked(RepAccessRequest.updateMany).mock.calls[0][0]).toMatchObject({ medicalRepresentativeId: REP, status: 'pending' });
    expect(notifyRepAddedByClinic).toHaveBeenCalledWith(REP, new Types.ObjectId(CLINIC));
    expect(MedicalRepresentative.create).not.toHaveBeenCalled();
  });

  it('says so when the rep is already on the list', async () => {
    vi.mocked(MedicalRepresentative.findOne).mockReturnValueOnce(lean({ _id: REP, tenantIds: [new Types.ObjectId(CLINIC)] }) as any);
    const res = await addRep(req('POST', BODY));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already on your list/);
  });

  it('still refuses an email that belongs to a clinic staff account', async () => {
    vi.mocked(MedicalRepresentative.findOne).mockReturnValueOnce(lean(null) as any);
    vi.mocked(User.findOne).mockReturnValueOnce(lean({ _id: 'u' }) as any);
    expect((await addRep(req('POST', BODY))).status).toBe(400);
    expect(MedicalRepresentative.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/medical-representatives/clinics/[id] (rep leaves)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(loadRepProfileForVisits).mockResolvedValue({ _id: REP, firstName: 'Ana', lastName: 'Cruz', company: 'Acme Pharma', tenantIds: [new Types.ObjectId(CLINIC)] } as any);
    vi.mocked(getClinicForReps).mockResolvedValue({ id: CLINIC, settings: { enabled: true, openToAllReps: false } } as any);
    const visits = (await import('@/models/MedicalRepresentativeVisit')).default as any;
    visits.countDocuments.mockResolvedValue(0);
  });

  it('takes the clinic off the rep’s list only and tells the clinic', async () => {
    const res = await leave(req('DELETE'), ctx(CLINIC));
    expect(res.status).toBe(200);
    expect(vi.mocked(MedicalRepresentativeModel.updateOne).mock.calls[0]).toEqual([{ _id: REP }, { $pull: { tenantIds: new Types.ObjectId(CLINIC) } }]);
    expect(notifyClinicRepLeft).toHaveBeenCalledWith(CLINIC, { name: 'Ana Cruz', company: 'Acme Pharma' });
    expect((await res.json()).data.canBook).toBe(false);
  });

  it('won’t strand upcoming visits at a clinic that takes only its own reps', async () => {
    const visits = (await import('@/models/MedicalRepresentativeVisit')).default as any;
    visits.countDocuments.mockResolvedValueOnce(2);
    const res = await leave(req('DELETE'), ctx(CLINIC));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ACTIVE_VISITS', count: 2 });
    expect(MedicalRepresentativeModel.updateOne).not.toHaveBeenCalled();
  });

  it('an open clinic can be left with visits, and stays bookable', async () => {
    vi.mocked(getClinicForReps).mockResolvedValueOnce({ id: CLINIC, settings: { enabled: true, openToAllReps: true } } as any);
    const res = await leave(req('DELETE'), ctx(CLINIC));
    expect((await res.json()).data.canBook).toBe(true);
  });

  it('404 when not on the clinic’s list', async () => {
    vi.mocked(loadRepProfileForVisits).mockResolvedValueOnce({ _id: REP, firstName: 'A', lastName: 'C', tenantIds: [] } as any);
    expect((await leave(req('DELETE'), ctx(CLINIC))).status).toBe(404);
  });
});
