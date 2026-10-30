import { describe, it, expect, beforeEach, vi } from 'vitest';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));
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
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn(async () => null) }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn(async () => ({ tenantId: null })) }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));
vi.mock('@/lib/automations/waitlist-management', () => ({ addToWaitlist: vi.fn(async () => ({ success: true, added: true })) }));
vi.mock('@/lib/automations/shared', () => ({
  automationEnabled: (settings: any, key: string) => settings?.automationSettings?.[key] !== false,
}));
vi.mock('@/models/Specialization', () => ({ default: {} }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/WaitlistEntry', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { createAuditLog } from '@/lib/audit';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { getSettings } from '@/lib/settings';
import { addToWaitlist } from '@/lib/automations/waitlist-management';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Tenant from '@/models/Tenant';
import WaitlistEntry from '@/models/WaitlistEntry';
import { GET, POST } from '@/app/api/patients/me/waitlist/route';
import { DELETE } from '@/app/api/patients/me/waitlist/[id]/route';
import { isLapsed } from '@/app/api/patients/me/waitlist/_lib/waitlist-view';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439022';
const DOCTOR_ID = '507f1f77bcf86cd799439066';
const ENTRY_ID = '507f1f77bcf86cd799439077';
const DAY = 24 * 60 * 60 * 1000;

/** Any query chain: select/populate/sort/limit return itself, lean() resolves `result`. */
const chain = (result: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(result) };
  for (const m of ['select', 'populate', 'sort', 'limit', 'skip']) q[m] = vi.fn().mockReturnValue(q);
  return q;
};
const patientQuery = (patient: unknown) => chain(patient);
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const entryRow = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(ENTRY_ID),
  tenantId: new Types.ObjectId(TENANT_A),
  patient: new Types.ObjectId(PATIENT_ID),
  doctor: { _id: new Types.ObjectId(DOCTOR_ID), firstName: 'Ana', lastName: 'Reyes', specializationId: { name: 'Pediatrics' } },
  preferredDate: new Date(`${ymd(3)}T00:00:00.000Z`),
  status: 'waiting',
  priority: 5,
  createdAt: new Date(),
  ...over,
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/patients/me/waitlist', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

describe('patient waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', email: 'p@x.y' } as any);
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A] }));
    vi.mocked(Doctor.findOne).mockReturnValue(
      chain({ _id: new Types.ObjectId(DOCTOR_ID), tenantId: new Types.ObjectId(TENANT_A), firstName: 'Ana', lastName: 'Reyes' })
    );
    vi.mocked(Tenant.find).mockReturnValue(chain([{ _id: TENANT_A, name: 'Sunrise Clinic' }]));
    vi.mocked(WaitlistEntry.find).mockReturnValue(chain([]));
    vi.mocked(WaitlistEntry.findOne).mockReturnValue(chain(entryRow()));
    vi.mocked(getSettings).mockResolvedValue({} as any);
  });

  it('GET lists own waiting and recently filled entries, scoped to their clinics, without staff priority', async () => {
    const q = chain([entryRow()]);
    vi.mocked(WaitlistEntry.find).mockReturnValue(q);
    const res = await GET(new NextRequest('http://localhost/api/patients/me/waitlist'));
    expect(res.status).toBe(200);
    const filter = (vi.mocked(WaitlistEntry.find).mock.calls as any)[0][0];
    expect(filter.patient).toEqual({ $in: [new Types.ObjectId(PATIENT_ID)] });
    expect(filter.tenantId).toEqual({ $in: [TENANT_A] });
    expect(filter.$or[0]).toEqual({ status: 'waiting' });
    expect(q.select).toHaveBeenCalledWith('-priority');
    const body = await res.json();
    expect(body.data.maxActive).toBe(3);
    expect(body.data.entries[0]).toMatchObject({
      _id: ENTRY_ID,
      status: 'waiting',
      lapsed: false,
      preferredDate: ymd(3),
      clinic: { tenantId: TENANT_A, name: 'Sunrise Clinic' },
      doctor: { _id: DOCTOR_ID, firstName: 'Ana', specialization: 'Pediatrics' },
    });
    expect(body.data.entries[0]).not.toHaveProperty('priority');
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await post({ doctorId: DOCTOR_ID })).status).toBe(401);
  });

  it('joining needs an active eMCR (booking), leaving does not', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireActiveEmcr).mockResolvedValueOnce(NextResponse.json({ code: 'ACTIVATION_REQUIRED' }, { status: 402 }));
    expect((await post({ doctorId: DOCTOR_ID })).status).toBe(402);
    expect(addToWaitlist).not.toHaveBeenCalled();

    vi.mocked(WaitlistEntry.findOneAndUpdate).mockReturnValue(chain(entryRow({ status: 'removed' })));
    const res = await DELETE(new NextRequest(`http://localhost/api/patients/me/waitlist/${ENTRY_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ENTRY_ID }),
    });
    expect(res.status).toBe(200);
    expect(requireActiveEmcr).toHaveBeenCalledTimes(1);
  });

  it("joins at the doctor's clinic on that clinic's record, and audits it", async () => {
    const res = await post({ doctorId: DOCTOR_ID, preferredDate: ymd(3) });
    expect(res.status).toBe(201);
    const [patientId, options] = vi.mocked(addToWaitlist).mock.calls[0] as any;
    expect(String(patientId)).toBe(PATIENT_ID);
    expect(String(options.tenantId)).toBe(TENANT_A);
    expect(String(options.doctorId)).toBe(DOCTOR_ID);
    expect(options.preferredDate.toISOString()).toBe(`${ymd(3)}T00:00:00.000Z`);
    expect(options).not.toHaveProperty('priority');
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PATIENT_ID, userRole: 'patient', action: 'create', dataSubject: PATIENT_ID, resourceId: ENTRY_ID })
    );
    expect((await res.json()).data.entry.status).toBe('waiting');
  });

  it("404 for a doctor at a clinic the patient isn't registered at", async () => {
    vi.mocked(Doctor.findOne).mockReturnValue(chain({ _id: new Types.ObjectId(DOCTOR_ID), tenantId: new Types.ObjectId(TENANT_B) }));
    expect((await post({ doctorId: DOCTOR_ID })).status).toBe(404);
    expect(addToWaitlist).not.toHaveBeenCalled();
  });

  it("409 WAITLIST_OFF when the clinic doesn't fill from a waitlist", async () => {
    vi.mocked(getSettings).mockResolvedValue({ automationSettings: { autoWaitlistManagement: false } } as any);
    const res = await post({ doctorId: DOCTOR_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('WAITLIST_OFF');
  });

  it('400 for a day in the past or beyond the booking horizon', async () => {
    expect((await post({ doctorId: DOCTOR_ID, preferredDate: ymd(-2) })).status).toBe(400);
    expect((await post({ doctorId: DOCTOR_ID, preferredDate: ymd(90) })).status).toBe(400);
    expect((await post({ doctorId: DOCTOR_ID, preferredDate: 'tomorrow' })).status).toBe(400);
    expect(addToWaitlist).not.toHaveBeenCalled();
  });

  it('409 ALREADY_WAITING instead of overwriting a live entry at the same clinic', async () => {
    vi.mocked(WaitlistEntry.find).mockReturnValue(chain([entryRow({ doctor: new Types.ObjectId(DOCTOR_ID) })]));
    const res = await post({ doctorId: DOCTOR_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_WAITING');
    expect(addToWaitlist).not.toHaveBeenCalled();
  });

  it('retires a lapsed entry at the same clinic and joins anew', async () => {
    vi.mocked(WaitlistEntry.find).mockReturnValue(chain([entryRow({ preferredDate: new Date(Date.now() - 20 * DAY) })]));
    expect((await post({ doctorId: DOCTOR_ID })).status).toBe(201);
    expect(WaitlistEntry.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(ENTRY_ID), status: 'waiting' },
      { $set: { status: 'removed' } }
    );
    expect(addToWaitlist).toHaveBeenCalled();
  });

  it('409 WAITLIST_LIMIT at the cap across clinics', async () => {
    const elsewhere = (i: number) =>
      entryRow({ _id: new Types.ObjectId(), tenantId: new Types.ObjectId(), patient: new Types.ObjectId(), preferredDate: undefined, doctor: `d${i}` });
    vi.mocked(WaitlistEntry.find).mockReturnValue(chain([elsewhere(1), elsewhere(2), elsewhere(3)]));
    const res = await post({ doctorId: DOCTOR_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('WAITLIST_LIMIT');
  });

  it('a family manager joins for the profile and is audited as themselves', async () => {
    const GUARDIAN = '507f1f77bcf86cd799439099';
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, guardianId: GUARDIAN, type: 'patient', email: 'g@x.y' } as any);
    expect((await post({ doctorId: DOCTOR_ID })).status).toBe(201);
    expect(String(vi.mocked(addToWaitlist).mock.calls[0][0])).toBe(PATIENT_ID);
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({
      userId: GUARDIAN,
      dataSubject: PATIENT_ID,
      description: expect.stringContaining('family member'),
    });
  });

  it('DELETE only leaves a waiting entry of their own, at their clinics', async () => {
    vi.mocked(WaitlistEntry.findOneAndUpdate).mockReturnValue(chain(null));
    const res = await DELETE(new NextRequest(`http://localhost/api/patients/me/waitlist/${ENTRY_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ENTRY_ID }),
    });
    expect(res.status).toBe(404);
    expect(vi.mocked(WaitlistEntry.findOneAndUpdate).mock.calls[0][0]).toEqual({
      _id: ENTRY_ID,
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      status: 'waiting',
    });
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('an entry lapses a week after its day', () => {
    expect(isLapsed({ status: 'waiting', preferredDate: new Date(Date.now() - 8 * DAY) })).toBe(true);
    expect(isLapsed({ status: 'waiting', preferredDate: new Date(Date.now() - 6 * DAY) })).toBe(false);
    expect(isLapsed({ status: 'waiting' })).toBe(false);
    expect(isLapsed({ status: 'filled', preferredDate: new Date(0) })).toBe(false);
  });
});
