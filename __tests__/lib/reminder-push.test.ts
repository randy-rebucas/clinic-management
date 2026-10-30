import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn().mockResolvedValue({}), preloadSettings: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), escapeHtml: (s: unknown) => String(s ?? '') }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToPatientDevices: vi.fn() }));
vi.mock('@/models/Appointment', () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Prescription', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/lib/automations/shared', async (orig) => ({
  ...(await orig<typeof import('@/lib/automations/shared')>()),
  getTenantTimezone: vi.fn().mockResolvedValue('Asia/Manila'),
  claimForSend: vi.fn().mockResolvedValue(true),
  releaseClaim: vi.fn().mockResolvedValue(undefined),
  forEachTenant: vi.fn(async (_id: unknown, fn: (t: unknown) => Promise<unknown>) => [
    { tenantId: TENANT, success: true, result: await fn(TENANT_INFO) },
  ]),
}));

import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import { sendSMS } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { releaseClaim } from '@/lib/automations/shared';
import { processDayBeforeReminders } from '@/lib/automations/appointment-reminders';
import { sendPaymentReminder } from '@/lib/automations/payment-reminders';
import { sendRefillReminder } from '@/lib/automations/prescription-refills';

const TENANT = '507f1f77bcf86cd799439011';
const TENANT_INFO = { tenantId: TENANT, tenantObjectId: new Types.ObjectId(TENANT), name: 'Clinic', timezone: 'Asia/Manila' };
const PATIENT = new Types.ObjectId('507f1f77bcf86cd799439031');
const APPT = new Types.ObjectId('507f1f77bcf86cd799439041');
const VISIT = new Types.ObjectId('507f1f77bcf86cd799439051');
const FOLLOWUP_APPT = new Types.ObjectId('507f1f77bcf86cd799439061');

/** A mongoose query stub: chainable, resolves to `value`. */
const query = (value: unknown) => {
  const q: any = Promise.resolve(value);
  for (const m of ['populate', 'limit', 'select', 'sort']) q[m] = vi.fn().mockReturnValue(q);
  q.lean = vi.fn().mockResolvedValue(value);
  return q;
};

const pushCall = (i = 0) => vi.mocked(sendPushToPatientDevices).mock.calls[i];

beforeEach(() => {
  vi.mocked(sendSMS).mockReset().mockResolvedValue({ success: true, sid: 'SM1' });
  vi.mocked(sendEmail).mockReset().mockResolvedValue({ success: true } as any);
  vi.mocked(sendPushToPatientDevices).mockReset().mockResolvedValue({ sent: true });
  vi.mocked(Appointment.updateOne).mockReset().mockResolvedValue({} as any);
  vi.mocked(Visit.updateOne).mockReset().mockResolvedValue({} as any);
  vi.mocked(releaseClaim).mockClear();
  vi.mocked(Appointment.find).mockReturnValue(query([]));
  vi.mocked(Visit.find).mockReturnValue(query([]));
});

describe('day-before appointment reminder push', () => {
  const appointment = (patient: Record<string, unknown>) => ({
    _id: APPT,
    status: 'confirmed',
    appointmentDate: new Date('2026-10-31T02:00:00Z'),
    appointmentTime: '10:00',
    patient: { _id: PATIENT, firstName: 'Ana', ...patient },
    doctor: { firstName: 'Jose', lastName: 'Rizal' },
  });

  it('pushes without naming the doctor and marks the reminder sent', async () => {
    vi.mocked(Appointment.find).mockReturnValue(query([appointment({ phone: '+639170000000' })]));
    const out = await processDayBeforeReminders(TENANT);

    expect(sendSMS).toHaveBeenCalledOnce();
    const [patientId, payload, options] = pushCall();
    expect(patientId).toBe(String(PATIENT));
    expect(payload.tag).toBe(`appointment-reminder-${APPT}`);
    expect(payload.body).not.toContain('Rizal');
    expect(String(options?.tenantId)).toBe(TENANT);
    expect((vi.mocked(Appointment.updateOne).mock.calls[0] as unknown[])[1]).toMatchObject({ $set: { reminderSentAt: expect.any(Date) } });
    expect(out.appointmentReminders[0]).toMatchObject({ success: true, pushed: true });
  });

  it('reaches a patient with no phone through the app', async () => {
    vi.mocked(Appointment.find).mockReturnValue(query([appointment({})]));
    const out = await processDayBeforeReminders(TENANT);

    expect(sendSMS).not.toHaveBeenCalled();
    expect(Appointment.updateOne).toHaveBeenCalledOnce();
    expect(out.appointmentReminders).toHaveLength(1);
  });

  it('still counts a delivered SMS when no device got the push', async () => {
    vi.mocked(sendPushToPatientDevices).mockResolvedValue({ sent: false });
    vi.mocked(Appointment.find).mockReturnValue(query([appointment({ phone: '+639170000000' })]));
    await processDayBeforeReminders(TENANT);
    expect(Appointment.updateOne).toHaveBeenCalledOnce();
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it('gives the claim back when neither channel delivered', async () => {
    vi.mocked(sendPushToPatientDevices).mockRejectedValue(new Error('expo down'));
    vi.mocked(sendSMS).mockRejectedValue(new Error('sms down'));
    vi.mocked(Appointment.find).mockReturnValue(query([appointment({ phone: '+639170000000' })]));
    const out = await processDayBeforeReminders(TENANT);

    expect(Appointment.updateOne).not.toHaveBeenCalled();
    expect(releaseClaim).toHaveBeenCalledOnce();
    expect(out.appointmentReminders[0]).toMatchObject({ success: false, error: 'sms down' });
  });
});

describe('follow-up visit reminder push', () => {
  it('points at the booked follow-up appointment when there is one', async () => {
    vi.mocked(Visit.find).mockReturnValue(
      query([{ _id: VISIT, followUpDate: new Date('2026-10-31T02:00:00Z'), followUpAppointmentId: FOLLOWUP_APPT, patient: { _id: PATIENT } }])
    );
    await processDayBeforeReminders(TENANT);

    const [, payload] = pushCall();
    expect(payload.tag).toBe(`followup-${VISIT}`);
    expect(payload.data).toEqual({ appointmentId: String(FOLLOWUP_APPT) });
    expect(Visit.updateOne).toHaveBeenCalledOnce();
  });
});

describe('payment reminder push', () => {
  it('pushes the invoice without the amount and counts as sent', async () => {
    vi.mocked(Invoice.findOne).mockReturnValue(
      query({
        _id: APPT,
        invoiceNumber: 'INV-1',
        outstandingBalance: 1234.5,
        status: 'unpaid',
        createdAt: new Date('2026-10-01T00:00:00Z'),
        patient: { _id: PATIENT, firstName: 'Ana' },
      })
    );
    const out = await sendPaymentReminder({ invoiceId: APPT, tenantId: TENANT });

    expect(out).toEqual({ success: true, sent: true });
    const [, payload] = pushCall();
    expect(payload.tag).toBe(`invoice-${APPT}`);
    expect(payload.body).not.toMatch(/1234|INV-1/);
  });

  it('skips the push when asked to', async () => {
    vi.mocked(Invoice.findOne).mockReturnValue(
      query({ _id: APPT, outstandingBalance: 10, status: 'unpaid', createdAt: new Date(), patient: { _id: PATIENT } })
    );
    const out = await sendPaymentReminder({ invoiceId: APPT, tenantId: TENANT, sendPush: false });
    expect(sendPushToPatientDevices).not.toHaveBeenCalled();
    expect(out.sent).toBe(false);
  });
});

describe('prescription refill reminder push', () => {
  it('never names the medicine on the lock screen', async () => {
    vi.mocked(Prescription.findOne).mockReturnValue(
      query({
        _id: APPT,
        status: 'active',
        issuedAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
        medications: [{ name: 'Sertraline', durationDays: 30 }],
        patient: { _id: PATIENT, firstName: 'Ana' },
      })
    );
    const out = await sendRefillReminder({ prescriptionId: APPT, tenantId: TENANT });

    expect(out).toEqual({ success: true, sent: true });
    const [, payload] = pushCall();
    expect(payload.tag).toBe(`prescription-refill-${APPT}`);
    expect(`${payload.title} ${payload.body}`).not.toContain('Sertraline');
  });
});
