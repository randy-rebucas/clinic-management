import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/models/Appointment', () => ({ default: { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({ default: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: {} }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn(async () => ({ tenantId: null })) }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  rateLimiters: { public: {}, publicWrite: {}, publicWritePhone: {} },
}));
vi.mock('@/lib/turnstile', () => ({ turnstileRejection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/public-tenant', () => ({ resolvePublicTenant: vi.fn() }));
vi.mock('@/lib/public-phone-proof', () => ({
  phoneProofMatches: vi.fn(() => false),
  phoneProofRequiredResponse: vi.fn(),
  publicPhoneProofRequired: vi.fn(() => false),
}));
vi.mock('@/lib/sms-preferences', () => ({ setSmsPreference: vi.fn() }));
vi.mock('@/lib/patient-schema', () => ({ nextPatientCode: vi.fn(async () => 'PAT-1') }));
vi.mock('@/lib/subscription-limits', () => ({ checkSubscriptionLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('@/lib/appointment-booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appointment-booking')>()),
  findDoctorConflict: vi.fn(async () => null),
  nextAppointmentCode: vi.fn(async () => 'APT-000001'),
}));
vi.mock('@/lib/booking-slots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/booking-slots')>()),
  slotRejection: vi.fn(() => null),
}));
vi.mock('@/app/lib/patient-auth', () => ({
  verifyPatientAuth: vi.fn(),
  patientAuthError: vi.fn(),
}));
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn(async () => null) }));
vi.mock('@/app/api/patients/me/_lib/linked-records', () => ({
  linkedRecords: vi.fn(),
  recordAtClinic: vi.fn(),
}));
vi.mock('@/app/api/patients/appointments/_lib/booking', () => ({
  checkPatientSlot: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  slotTaken: vi.fn(),
  teleconsultOffered: vi.fn(async () => true),
  toPatientBooking: vi.fn(() => ({})),
}));

import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { applyRateLimit } from '@/lib/middleware/rate-limit';
import { turnstileRejection } from '@/lib/turnstile';
import { resolvePublicTenant } from '@/lib/public-tenant';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { linkedRecords, recordAtClinic } from '@/app/api/patients/me/_lib/linked-records';
import { checkPatientSlot } from '@/app/api/patients/appointments/_lib/booking';
import { GET, POST } from '@/app/api/appointments/public/route';
import { POST as portalPost } from '@/app/api/patients/appointments/route';

const TENANT = new Types.ObjectId('507f1f77bcf86cd799439055');
const DOCTOR_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = new Types.ObjectId('507f1f77bcf86cd799439022');

const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }) });
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const booking = {
  patientEmail: 'ana@example.com',
  patientPhone: '+639171234567',
  patientFirstName: 'Ana',
  patientLastName: 'Reyes',
  doctorId: DOCTOR_ID,
  appointmentDate: '2030-03-04',
  appointmentTime: '09:00',
};
const book = (changes: Record<string, unknown>) => POST(post('/api/appointments/public', { ...booking, ...changes }));

describe('appointment form hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePublicTenant).mockResolvedValue(TENANT);
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(turnstileRejection).mockResolvedValue(null);
    vi.mocked(Doctor.findOne).mockReturnValue(lean({ _id: DOCTOR_ID, tenantId: TENANT, firstName: 'Jo', lastName: 'Cruz' }) as any);
    vi.mocked(Patient.findOne).mockReturnValue({ select: async () => ({ _id: PATIENT_ID }) } as any);
    vi.mocked(Appointment.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(Appointment.create).mockResolvedValue({ appointmentCode: 'APT-000001', status: 'pending' } as any);
  });

  describe('public booking', () => {
    it.each([
      ['a line feed', 'Ana\nSubmitted phone: +639170000000'],
      ['a line separator', 'Ana Submitted phone: +639170000000'],
      ['a paragraph separator', 'Ana Submitted phone: +639170000000'],
    ])('refuses a name with %s, which could forge the phone line in the notes', async (_label, name) => {
      expect((await book({ patientLastName: name })).status).toBe(400);
      expect(Appointment.create).not.toHaveBeenCalled();
    });

    it('still takes real names', async () => {
      expect((await book({ patientFirstName: 'María José', patientLastName: "O'Brien-Dela Cruz" })).status).toBe(201);
    });

    it('refuses dates that do not exist', async () => {
      expect((await book({ appointmentDate: '2030-02-31' })).status).toBe(400);
      expect((await book({ dateOfBirth: '1990-13-45' })).status).toBe(400);
      expect(Appointment.create).not.toHaveBeenCalled();
    });

    it('refuses a date of birth in the future', async () => {
      expect((await book({ dateOfBirth: '2999-01-01' })).status).toBe(400);
    });

    it('does not let a visitor pick a room', async () => {
      expect((await book({ room: 'Room 101' })).status).toBe(201);
      expect(vi.mocked(Appointment.create).mock.calls[0][0]).not.toHaveProperty('room');
    });

    it('checks the captcha token and writes nothing when it fails', async () => {
      vi.mocked(turnstileRejection).mockResolvedValue(NextResponse.json({}, { status: 403 }));
      expect((await book({ turnstileToken: 'bad-token' })).status).toBe(403);
      expect(vi.mocked(turnstileRejection).mock.calls[0][1]).toBe('bad-token');
      expect(Doctor.findOne).not.toHaveBeenCalled();
      expect(Patient.findOne).not.toHaveBeenCalled();
      expect(Appointment.create).not.toHaveBeenCalled();
    });

    it('stops at the pending limit for a phone number', async () => {
      vi.mocked(Appointment.countDocuments).mockResolvedValue(3 as any);
      expect((await book({})).status).toBe(429);
      expect(Appointment.create).not.toHaveBeenCalled();
    });
  });

  describe('public doctor list', () => {
    it('keeps schedules and time off private', async () => {
      vi.mocked(Doctor.find).mockReturnValue(
        lean([{ _id: DOCTOR_ID, firstName: 'Jo', lastName: 'Cruz', schedule: [{ day: 1 }], availabilityOverrides: [{ reason: 'surgery' }] }]) as any
      );
      const body = await (await GET(new NextRequest('http://localhost/api/appointments/public'))).json();
      expect(body.data.doctors).toEqual([{ _id: DOCTOR_ID, firstName: 'Jo', lastName: 'Cruz' }]);
    });

    it('is rate limited', async () => {
      vi.mocked(applyRateLimit).mockResolvedValue(NextResponse.json({}, { status: 429 }));
      expect((await GET(new NextRequest('http://localhost/api/appointments/public'))).status).toBe(429);
      expect(Doctor.find).not.toHaveBeenCalled();
    });
  });

  describe('patient portal booking', () => {
    const portal = () =>
      portalPost(post('/api/patients/appointments', { doctorId: DOCTOR_ID, appointmentDate: '2030-03-04', appointmentTime: '09:00' }));

    beforeEach(() => {
      vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: String(PATIENT_ID) } as any);
      vi.mocked(Patient.findById).mockReturnValue(lean({ _id: PATIENT_ID, tenantIds: [TENANT] }) as any);
      vi.mocked(linkedRecords).mockResolvedValue({ tenantIds: [TENANT] } as any);
      vi.mocked(recordAtClinic).mockReturnValue(PATIENT_ID as any);
      vi.mocked(checkPatientSlot).mockResolvedValue({ tz: 'Asia/Manila', rules: { slotMinutes: 30 } } as any);
    });

    it('stops one account holding more than the pending limit', async () => {
      vi.mocked(Appointment.countDocuments).mockResolvedValue(3 as any);
      expect((await portal()).status).toBe(429);
      expect(Appointment.countDocuments).toHaveBeenCalledWith({ tenantId: TENANT, patient: PATIENT_ID, status: 'pending' });
      expect(Appointment.create).not.toHaveBeenCalled();
    });

    it('lets a request through under the limit', async () => {
      vi.mocked(Appointment.countDocuments).mockResolvedValue(2 as any);
      vi.mocked(Appointment.create).mockResolvedValue({ populate: vi.fn() } as any);
      expect((await portal()).status).toBe(201);
    });
  });
});
