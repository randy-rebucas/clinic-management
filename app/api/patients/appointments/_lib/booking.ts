import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';
import { sendSMS } from '@/lib/sms';
import { normalizePhone } from '@/lib/phone';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { getSettings } from '@/lib/settings';
import { withPatientTeleconsult } from '@/lib/teleconsult';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentDayRange,
  findDoctorConflict,
  timeToMinutes,
} from '@/lib/appointment-booking';
import { bookingRulesFrom, clinicClock, slotRejection, type BookableDoctor, type BookingRules } from '@/lib/booking-slots';

/**
 * Shared by the patient's booking (POST /api/patients/appointments) and reschedule
 * (PATCH /api/patients/appointments/[id]): the same slot rules, the same 409s.
 */

export const SLOT_TAKEN_MESSAGE = 'This time slot is no longer available. Please choose another time.';

export const slotTaken = () => NextResponse.json({ success: false, error: SLOT_TAKEN_MESSAGE }, { status: 409 });

/** The booked appointment as the patient sees it: no internal staff notes, no raw video room. */
export function toPatientBooking(appointment: { toObject?: () => Record<string, any> } & Record<string, any>, tz: string) {
  const { notes: _notes, createdBy: _createdBy, ...rest } =
    typeof appointment.toObject === 'function' ? appointment.toObject() : appointment;
  return withPatientTeleconsult(rest, { tz, displayName: rest.patient?.firstName });
}

/** Video visits are offered when the clinic turned them on and its plan includes them. */
export async function teleconsultOffered(tenantId: Types.ObjectId): Promise<boolean> {
  const settings = await getSettings(String(tenantId));
  if (settings.appointmentSettings?.teleconsultBooking !== true) return false;
  return (await checkSubscriptionLimit(tenantId, 'useFeature', 'teleconsult')).allowed;
}

export interface PatientSlotRequest {
  tenantId: Types.ObjectId;
  doctor: BookableDoctor & { _id: unknown; lastName?: string };
  /** The patient's record at this clinic. */
  patientId: unknown;
  /** "yyyy-MM-dd" (clinic calendar day). */
  appointmentDate: string;
  /** "HH:mm". */
  appointmentTime: string;
  /** Length to hold; the clinic's usual appointment length when left out. */
  duration?: number;
  /** The appointment being moved (it doesn't conflict with itself). */
  excludeId?: unknown;
}

/**
 * Whether the patient may take this slot: only one the GET could have offered (not in the past
 * in clinic time, inside the booking horizon, the doctor's hours and the clinic's opening hours,
 * on the slot grid), free on the doctor's calendar, and not clashing with the patient's own
 * appointments. Returns the clinic's timezone and booking rules, or the 400/409 to send.
 */
export async function checkPatientSlot(req: PatientSlotRequest): Promise<{ tz: string; rules: BookingRules } | NextResponse> {
  const { tenantId, doctor, appointmentDate, appointmentTime } = req;
  const tz = await getTenantTimezone(tenantId);
  const rules = bookingRulesFrom(await getSettings(String(tenantId)));

  const rejection = slotRejection(doctor, appointmentDate, timeToMinutes(appointmentTime), clinicClock(tz), rules);
  if (rejection) {
    const error = {
      past: 'Please choose a future date and time.',
      'beyond-horizon': 'Appointments can only be booked up to 60 days ahead.',
      'not-working': `Dr. ${doctor.lastName} isn't seeing patients at that time. Please choose another time.`,
      'off-grid': 'Please choose one of the offered appointment times.',
    }[rejection];
    return NextResponse.json({ success: false, error, code: `SLOT_${rejection.toUpperCase().replace('-', '_')}` }, { status: 400 });
  }

  const excludeId = req.excludeId ? new Types.ObjectId(String(req.excludeId)) : undefined;
  const conflictingAppointment = await findDoctorConflict({
    tenantId,
    doctorId: String(doctor._id),
    appointmentDate,
    appointmentTime,
    duration: req.duration || rules.slotMinutes,
    tz,
    excludeId,
  });
  if (conflictingAppointment) return slotTaken();

  const { start, end } = appointmentDayRange(appointmentDate, tz);
  const patientConflict = await Appointment.findOne({
    tenantId,
    patient: req.patientId,
    appointmentDate: { $gte: start, $lte: end },
    appointmentTime,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('_id').lean();
  if (patientConflict) {
    return NextResponse.json(
      { success: false, error: 'You already have an appointment at this time.' },
      { status: 409 }
    );
  }

  return { tz, rules };
}

/**
 * The patient's SMS for a new request or a moved one (populated `patient` and `doctor`).
 * Never throws.
 */
export async function sendBookingConfirmation(appointment: any, tz: string, opts: { rescheduled?: boolean } = {}) {
  const patient = appointment.patient;
  const doctor = appointment.doctor;
  if (!patient) return;
  const appointmentDate = formatInTz(appointment.appointmentDate, 'EEEE, MMMM d, yyyy', tz);
  const [hours, minutes] = String(appointment.appointmentTime).split(':').map(Number);
  const displayTime = hours >= 12
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const video = appointment.modality === 'teleconsult';
  const what = video ? 'video visit' : 'appointment';
  const withDoctor = doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : '';
  const lead = opts.rescheduled
    ? `Hi ${patient.firstName}! Your ${what} (${appointment.appointmentCode}) has been moved to ${appointmentDate} at ${displayTime}${withDoctor}.`
    : `Hi ${patient.firstName}! Your ${what} request (${appointment.appointmentCode}) has been submitted. Date: ${appointmentDate} at ${displayTime}${withDoctor}.`;
  const message = `${lead} Status: Pending confirmation. We'll notify you once confirmed.${video ? ' Join from the eMCR app, from 15 minutes before the start.' : ''}`;

  const phoneNumber = patient.phone ? normalizePhone(patient.phone) : null;
  if (phoneNumber) {
    await sendSMS({
      to: phoneNumber,
      message,
    }).catch((error) => {
      console.error(`Failed to send ${opts.rescheduled ? 'reschedule' : 'booking'} confirmation SMS:`, error);
    });
  }
}
