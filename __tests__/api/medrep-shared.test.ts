import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models', () => ({
  MedicalRepresentative: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), exists: vi.fn() },
  User: { updateOne: vi.fn(), exists: vi.fn() },
}));
vi.mock('@/app/lib/auth-helpers', () => ({ isAdmin: () => true, refuseAccess: vi.fn() }));
vi.mock('@/app/lib/dal', () => ({ revokeUserSessions: vi.fn() }));
vi.mock('@/lib/api/tenant-session', () => ({
  requireTenantSession: vi.fn(),
  isTenantSessionError: () => false,
  isValidId: () => true,
}));

import { Types } from 'mongoose';
import { MedicalRepresentative, User } from '@/models';
import { revokeUserSessions } from '@/app/lib/dal';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { DELETE, GET, PUT } from '@/app/api/medical-representatives/[id]/route';
import { changedRepDetails, hideOtherClinicsNotes } from '@/app/api/medical-representatives/_lib/shared-rep';

const CLINIC_A = new Types.ObjectId();
const CLINIC_B = new Types.ObjectId();
const REP = String(new Types.ObjectId());
const USER = new Types.ObjectId();

function storedRep(overrides: Record<string, unknown> = {}) {
  const rep: any = {
    _id: REP,
    tenantIds: [CLINIC_A, CLINIC_B],
    userId: USER,
    email: 'rep@example.com',
    firstName: 'Ana',
    lastName: 'Cruz',
    phone: '0917',
    company: 'Pharma',
    territory: 'Cebu, Bohol',
    products: ['Drug A'],
    notes: 'Clinic B says: slow to pay',
    status: 'active',
    isActivated: true,
    paymentStatus: 'completed',
    availability: [],
    save: vi.fn(),
    populate: vi.fn(),
    toObject() {
      const { save: _s, populate: _p, toObject: _t, ...plain } = rep;
      return { ...plain };
    },
    ...overrides,
  };
  return rep;
}

const put = (body: Record<string, unknown>) =>
  PUT(new NextRequest(`http://localhost/api/medical-representatives/${REP}`, { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: REP }),
  });

/** What the edit form sends when nothing was changed. */
const unchangedForm = {
  firstName: 'Ana',
  lastName: 'Cruz',
  email: 'rep@example.com',
  phone: '0917',
  company: { name: 'Pharma' },
  territory: ['Cebu', 'Bohol'],
  products: ['Drug A'],
  status: 'active',
};

describe('PUT /api/medical-representatives/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { role: 'admin' },
      tenantObjectId: CLINIC_A,
      tenantId: String(CLINIC_A),
    } as any);
  });

  it.each(['inactive', 'on-leave'])('one clinic cannot set a shared rep to %s', async (status) => {
    const rep = storedRep();
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    const res = await put({ status });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'REP_ACCOUNT', fields: ['status'] });
    expect(rep.save).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it('one clinic cannot overwrite the details or notes of a shared rep', async () => {
    const rep = storedRep();
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    const res = await put({ firstName: 'Changed', products: ['Other'], notes: 'mine' });
    expect(res.status).toBe(403);
    expect((await res.json()).fields.sort()).toEqual(['firstName', 'notes', 'products']);
    expect(rep.save).not.toHaveBeenCalled();
  });

  it('saving the form unchanged still works for a shared rep, and shows no notes', async () => {
    const rep = storedRep();
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    const res = await put(unchangedForm);
    expect(res.status).toBe(200);
    expect((await res.json()).data).not.toHaveProperty('notes');
  });

  it('an activated rep at this clinic only owns their account', async () => {
    const rep = storedRep({ tenantIds: [CLINIC_A] });
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    for (const [body, field] of [[{ status: 'inactive' }, 'status'], [{ email: 'new@example.com' }, 'email'], [{ firstName: 'New' }, 'firstName']] as const) {
      const res = await put(body);
      expect(res.status).toBe(403);
      expect((await res.json()).fields).toEqual([field]);
    }
    expect(rep.save).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it('notes stay editable at the only clinic of an activated rep', async () => {
    const rep = storedRep({ tenantIds: [CLINIC_A] });
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    const res = await put({ notes: 'our note' });
    expect(res.status).toBe(200);
    expect(rep.notes).toBe('our note');
  });

  it('an activated rep switched off earlier can be restored, shared or not', async () => {
    for (const tenantIds of [[CLINIC_A], [CLINIC_A, CLINIC_B]]) {
      vi.mocked(User.updateOne).mockClear();
      const rep = storedRep({ tenantIds, status: 'inactive' });
      vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
      expect((await put({ status: 'active' })).status).toBe(200);
      expect(rep.status).toBe('active');
      expect(User.updateOne).toHaveBeenCalledWith({ _id: USER }, { $set: { status: 'active' } });
    }
  });

  it('a rep the clinic set up, not yet activated, can still be edited and deactivated here', async () => {
    const rep = storedRep({ tenantIds: [CLINIC_A], isActivated: false });
    vi.mocked(MedicalRepresentative.findOne).mockResolvedValue(rep as any);
    const res = await put({ status: 'inactive' });
    expect(res.status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: USER }, { $set: { status: 'inactive' } });
    expect(revokeUserSessions).toHaveBeenCalledWith(String(USER));
  });
});

describe('DELETE /api/medical-representatives/[id]', () => {
  const remove = () =>
    DELETE(new NextRequest(`http://localhost/api/medical-representatives/${REP}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: REP }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({ session: { role: 'admin' }, tenantObjectId: CLINIC_A } as any);
  });

  it('an activated rep keeps their sign-in after their last clinic removes them', async () => {
    const rep = storedRep({ tenantIds: [] });
    vi.mocked(MedicalRepresentative.findOneAndUpdate).mockResolvedValue(rep as any);
    expect((await remove()).status).toBe(200);
    expect(rep.status).toBe('active');
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it('a never-activated profile ends with its last clinic', async () => {
    const rep = storedRep({ tenantIds: [], isActivated: false });
    vi.mocked(MedicalRepresentative.findOneAndUpdate).mockResolvedValue(rep as any);
    expect((await remove()).status).toBe(200);
    expect(rep.status).toBe('inactive');
    expect(revokeUserSessions).toHaveBeenCalledWith(String(USER));
  });

  it('removal from one clinic leaves a shared, never-activated profile alone', async () => {
    const rep = storedRep({ tenantIds: [CLINIC_B], isActivated: false });
    vi.mocked(MedicalRepresentative.findOneAndUpdate).mockResolvedValue(rep as any);
    expect((await remove()).status).toBe(200);
    expect(rep.status).toBe('active');
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });
});

describe('GET /api/medical-representatives/[id]', () => {
  const get = () => GET(new NextRequest(`http://localhost/api/medical-representatives/${REP}`), { params: Promise.resolve({ id: REP }) });
  const found = (value: unknown) =>
    vi.mocked(MedicalRepresentative.findOne).mockReturnValue({
      select: () => ({ populate: () => ({ lean: vi.fn().mockResolvedValue(value) }) }),
    } as any);

  beforeEach(() => {
    vi.mocked(requireTenantSession).mockResolvedValue({ tenantObjectId: CLINIC_A } as any);
  });

  it('hides notes on a shared rep, and keeps them at the only clinic', async () => {
    found({ tenantIds: [CLINIC_A, CLINIC_B], notes: 'private' });
    expect((await (await get()).json()).data).not.toHaveProperty('notes');
    found({ tenantIds: [CLINIC_A], notes: 'private' });
    expect((await (await get()).json()).data.notes).toBe('private');
  });
});

describe('changedRepDetails', () => {
  it('treats a missing stored value and an empty input as no change', () => {
    expect(changedRepDetails({}, { notes: '', company: '' })).toEqual([]);
  });

  it('ignores fields the request left out', () => {
    expect(changedRepDetails({ firstName: 'Ana' }, {})).toEqual([]);
  });

  it('spots availability changes, reading a missing isAvailable as available', () => {
    const slot = { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' };
    expect(changedRepDetails({ availability: [slot] }, { availability: [{ ...slot, isAvailable: true }] })).toEqual([]);
    expect(changedRepDetails({ availability: [slot] }, { availability: [{ ...slot, endTime: '11:00' }] })).toEqual(['availability']);
  });
});

describe('hideOtherClinicsNotes', () => {
  it('compares clinic ids by value', () => {
    expect(hideOtherClinicsNotes({ tenantIds: [String(CLINIC_A)], notes: 'n' }, CLINIC_A).notes).toBe('n');
  });
});
