import 'server-only';
import '@/models/Specialization';
import '@/models/Appointment';
import { directionOf } from '@/lib/referrals';
import { referralLetterUnavailable } from '@/lib/referral-letter';
import { doctorSummary } from '../../../_lib/doctor-summary';

/**
 * What a patient sees of a referral about them: who they are referred to (and by), why, its
 * status and dates, and the appointment booked from it. Never the clinic's notes, follow-up
 * notes, feedback, attachments, decline reason or reminder bookkeeping: the projection below is
 * a whitelist, so a field added to the model later stays staff-only until it is listed here.
 *
 * Patient-to-patient referrals ("a friend referred you") are a marketing record, not a medical
 * one, and name another patient, so they are never listed.
 */
export const PATIENT_REFERRAL_SELECT =
  'tenantId referralCode type status urgency specialty reason referringDoctor referringClinic referringContact.name ' +
  'receivingDoctor receivingClinic referredDate acceptedDate completedDate declinedDate followUpDate appointment patient createdAt';

export const PATIENT_REFERRAL_FILTER = { type: { $ne: 'patient_to_patient' } } as const;

const DOCTOR_SELECT = 'firstName lastName title specializationId';

/** Populates for the patient view. The appointment only resolves when it is this person's. */
export function patientReferralPopulates(patientIds: unknown[]) {
  return [
    { path: 'referringDoctor', select: DOCTOR_SELECT, populate: { path: 'specializationId', select: 'name' } },
    { path: 'receivingDoctor', select: DOCTOR_SELECT, populate: { path: 'specializationId', select: 'name' } },
    {
      path: 'appointment',
      select: 'appointmentCode appointmentDate appointmentTime scheduledAt status modality',
      match: { patient: { $in: patientIds } },
    },
  ];
}

type Lean = Record<string, any>;

function doctorView(doctor: unknown) {
  const d = doctorSummary(doctor as Lean | null);
  if (!d || typeof d !== 'object' || !('firstName' in d)) return null;
  const { _id, firstName, lastName, title, specialization } = d as Lean;
  return { _id: String(_id), firstName, lastName, title: title ?? null, specialization: specialization ?? null };
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** The patient-facing shape of one referral (lean, populated as above). */
export function toPatientReferral(r: Lean, clinicNames: Map<string, string | null>) {
  const direction = directionOf(r);
  const tenantId = r.tenantId ? String(r.tenantId) : null;
  const clinicName = tenantId ? clinicNames.get(tenantId) ?? null : null;
  const appointment = r.appointment && typeof r.appointment === 'object' && 'status' in r.appointment ? r.appointment : null;
  const referredTo = doctorView(r.receivingDoctor);
  const referredBy = doctorView(r.referringDoctor);
  return {
    _id: String(r._id),
    referralCode: r.referralCode ?? null,
    /** internal: to another doctor at the same clinic; out: to another clinic; in: to this clinic from elsewhere. */
    direction,
    status: r.status,
    urgency: r.urgency ?? 'routine',
    specialty: r.specialty ?? referredTo?.specialization ?? null,
    reason: r.reason ?? null,
    clinic: { tenantId, name: clinicName },
    referredTo: {
      doctor: referredTo,
      // An internal referral stays at the clinic that made it.
      clinic: r.receivingClinic || (direction === 'internal' || direction === 'in' ? clinicName : null),
    },
    referredBy: {
      doctor: referredBy,
      clinic: direction === 'in' ? r.referringClinic || r.referringContact?.name || null : clinicName,
    },
    referredDate: iso(r.referredDate ?? r.createdAt),
    acceptedDate: iso(r.acceptedDate),
    completedDate: iso(r.completedDate),
    declinedDate: iso(r.declinedDate),
    followUpDate: iso(r.followUpDate),
    appointment: appointment
      ? {
          _id: String(appointment._id),
          appointmentCode: appointment.appointmentCode ?? null,
          appointmentDate: iso(appointment.appointmentDate),
          appointmentTime: appointment.appointmentTime ?? null,
          scheduledAt: iso(appointment.scheduledAt),
          status: appointment.status ?? null,
          modality: appointment.modality ?? null,
        }
      : null,
    /** The app can ask for the letter PDF (POST …/pdf-link). */
    letterAvailable: referralLetterUnavailable(r) === null,
  };
}

export type PatientReferral = ReturnType<typeof toPatientReferral>;
