import { describe, it, expect, beforeEach, vi } from 'vitest';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyStaff: vi.fn().mockResolvedValue({ recipients: 2, batchId: 'b' }) }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn().mockResolvedValue('Asia/Manila') }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn().mockResolvedValue({ appointmentSettings: { defaultDuration: 30 } }) }));
vi.mock('@/lib/subscription-limits', () => ({ checkSubscriptionLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/app/api/patients/me/_lib/linked-records', () => ({ linkedRecords: vi.fn() }));
vi.mock('@/lib/booking-slots', async (orig) => ({
  ...(await orig<typeof import('@/lib/booking-slots')>()),
  slotRejection: vi.fn().mockReturnValue(null),
}));
vi.mock('@/lib/appointment-booking', async (orig) => ({
  ...(await orig<typeof import('@/lib/appointment-booking')>()),
  findDoctorConflict: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Appointment', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { linkedRecords } from '@/app/api/patients/me/_lib/linked-records';
import { slotRejection } from '@/lib/booking-slots';
import { findDoctorConflict } from '@/lib/appointment-booking';
import { createAuditLog } from '@/lib/audit';
import { notifyStaff } from '@/lib/notify';
import { sendSMS } from '@/lib/sms';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import User from '@/models/User';
import { PATCH } from '@/app/api/patients/appointments/[id]/route';

const TENANT = new Types.ObjectId('507f1f77bcf86cd799439011');
const PATIENT = new Types.ObjectId('507f1f77bcf86cd799439012');
const DOCTOR = new Types.ObjectId('507f1f77bcf86cd799439013');
const APPT = '507f1f77bcf86cd799439014';
const GUARDIAN = '507f1f77bcf86cd799439015';
const DOCTOR_USER = '507f1f77bcf86cd799439016';

/** Stored as the booking route stores it: the clinic day at UTC midnight. */
const current = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(APPT),
  tenantId: TENANT,
  patient: PATIENT,
  doctor: DOCTOR,
  appointmentCode: 'APT-000042',
  appointmentDate: new Date('2027-01-15'),
  appointmentTime: '09:00',
  duration: 30,
  status: 'confirmed',
  modality: 'teleconsult',
  isWalkIn: false,
  notes: 'Staff note',
  ...over,
});

const lean = (value: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(value) };
  q.select = vi.fn().mockReturnValue(q);
  return q;
};
/** Appointment.findOne: the route's own lookup first, then the helper's patient-clash lookup. */
const findOneReturns = (appointment: unknown, patientClash: unknown = null) =>
  vi.mocked(Appointment.findOne)
    .mockReturnValueOnce(lean(appointment) as any)
    .mockReturnValueOnce(lean(patientClash) as any);
const updateReturns = (value: unknown) => {
  const q: any = {};
  q.populate = vi.fn().mockReturnValue(q);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(resolve, reject);
  vi.mocked(Appointment.findOneAndUpdate).mockReturnValue(q);
  return q;
};

const call = (body: unknown, id = APPT) =>
  PATCH(
    new NextRequest(`http://localhost/api/patients/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
const MOVE = { appointmentDate: '2027-01-16', appointmentTime: '10:00' };

describe('PATCH /api/patients/appointments/[id] (reschedule)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Queued per-call results must not leak from one test into the next.
    vi.mocked(Appointment.findOne).mockReset();
    vi.mocked(Appointment.findOneAndUpdate).mockReset();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: String(PATIENT), email: 'p@x.y', type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue(lean({ _id: PATIENT, tenantIds: [TENANT] }) as any);
    vi.mocked(linkedRecords).mockResolvedValue({ patientIds: [PATIENT], tenantIds: [TENANT] } as any);
    vi.mocked(Doctor.findOne).mockReturnValue(lean({ _id: DOCTOR, firstName: 'Ana', lastName: 'Cruz', schedule: [] }) as any);
    vi.mocked(User.find).mockReturnValue(lean([{ _id: DOCTOR_USER }]) as any);
    vi.mocked(slotRejection).mockReturnValue(null);
    vi.mocked(findDoctorConflict).mockResolvedValue(null);
  });

  it('401 without a session', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await call(MOVE)).status).toBe(401);
  });

  it("404 for an appointment that isn't the patient's, looked up only among their records and clinics", async () => {
    findOneReturns(null);
    expect((await call(MOVE)).status).toBe(404);
    expect(vi.mocked(Appointment.findOne).mock.calls[0][0]).toEqual({
      _id: APPT,
      patient: { $in: [PATIENT] },
      tenantId: { $in: [TENANT] },
    });
    expect(Appointment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('400 for a closed appointment, as cancelling', async () => {
    findOneReturns(current({ status: 'cancelled' }));
    const res = await call(MOVE);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already cancelled/);
  });

  it('400 once the appointment has started', async () => {
    findOneReturns(current({ appointmentDate: new Date('2020-01-15') }));
    expect((await call(MOVE)).status).toBe(400);
    expect(Appointment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('400 for a slot the booking form could not have offered', async () => {
    findOneReturns(current());
    vi.mocked(slotRejection).mockReturnValue('off-grid');
    const res = await call(MOVE);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SLOT_OFF_GRID');
  });

  it('409 when the doctor is taken then, ignoring the appointment being moved', async () => {
    findOneReturns(current());
    vi.mocked(findDoctorConflict).mockResolvedValue({ _id: 'other' } as any);
    expect((await call(MOVE)).status).toBe(409);
    const opts = vi.mocked(findDoctorConflict).mock.calls[0][0];
    expect(String(opts.excludeId)).toBe(APPT);
    expect(String(opts.doctorId)).toBe(String(DOCTOR));
    expect(opts).toMatchObject({ appointmentDate: '2027-01-16', appointmentTime: '10:00', duration: 30 });
  });

  it('409 when the patient already has another appointment then', async () => {
    findOneReturns(current(), { _id: 'mine' });
    const res = await call(MOVE);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already have an appointment/);
  });

  it('409 when the unique slot index catches a race', async () => {
    findOneReturns(current());
    updateReturns(Object.assign(new Error('dup'), { code: 11000, keyPattern: { doctor: 1, appointmentTime: 1 } }));
    expect((await call(MOVE)).status).toBe(409);
  });

  it('409 when the appointment changed meanwhile', async () => {
    findOneReturns(current());
    updateReturns(null);
    expect((await call(MOVE)).status).toBe(409);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('moves the same appointment, keeps its visit type, and tells the clinic', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({
      patientId: String(PATIENT), guardianId: GUARDIAN, email: 'g@x.y', type: 'patient',
    } as any);
    findOneReturns(current());
    const moved = {
      ...current({ appointmentDate: new Date('2027-01-16'), appointmentTime: '10:00', status: 'pending' }),
      patient: { _id: PATIENT, firstName: 'Juan', lastName: 'Dela Cruz', phone: '09171234567' },
      doctor: { _id: DOCTOR, firstName: 'Ana', lastName: 'Cruz' },
    };
    updateReturns(moved);

    const res = await call(MOVE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe(APPT);
    expect(body.data.notes).toBeUndefined();

    const [filter, update] = vi.mocked(Appointment.findOneAndUpdate).mock.calls[0] as any[];
    expect(String(filter._id)).toBe(APPT);
    expect(filter).toMatchObject({ tenantId: TENANT, appointmentTime: '09:00' });
    expect(update.$set).toMatchObject({ appointmentTime: '10:00', status: 'pending' });
    expect(update.$set.appointmentDate.toISOString()).toBe('2027-01-16T00:00:00.000Z');
    expect(update.$set.notes).toMatch(/^Staff note\nRescheduled by patient from Fri, Jan 15 at 09:00 to Sat, Jan 16 at 10:00/);
    expect(update.$set).not.toHaveProperty('modality');
    expect(update.$unset).toEqual({ reminderSentAt: 1, reminderClaimedAt: 1 });

    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: GUARDIAN,
      userRole: 'patient',
      action: 'update',
      resource: 'appointment',
      resourceId: APPT,
      dataSubject: String(PATIENT),
      description: expect.stringContaining('(by a family member)'),
      changes: expect.arrayContaining([
        { field: 'appointmentTime', oldValue: '09:00', newValue: '10:00' },
        { field: 'status', oldValue: 'confirmed', newValue: 'pending' },
      ]),
    }));
    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: String(TENANT),
      audience: { roles: ['admin', 'owner', 'receptionist'], userIds: [DOCTOR_USER] },
      type: 'appointment',
      actionUrl: `/appointments/${APPT}`,
    }));
    expect((vi.mocked(User.find).mock.calls[0] as unknown[])[0]).toMatchObject({ tenantId: TENANT, doctorProfile: DOCTOR });
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('has been moved to') }));
    expect(vi.mocked(sendSMS).mock.calls[0][0].message).toContain('video visit');
  });

  it('asking for the slot it already has is a no-op success (a retry after a lost reply)', async () => {
    findOneReturns(current());
    const res = await call({ appointmentDate: '2027-01-15', appointmentTime: '09:00' });
    expect(res.status).toBe(200);
    expect(Appointment.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('400 for a malformed time', async () => {
    expect((await call({ appointmentDate: '2027-01-16', appointmentTime: '10am' })).status).toBe(400);
  });
});
