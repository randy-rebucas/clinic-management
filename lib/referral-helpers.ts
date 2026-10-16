import { Types } from 'mongoose';
import { z } from 'zod';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import { isValidId } from '@/lib/api/tenant-session';
import { zObjectId } from '@/lib/api/validate';
import { DIRECTIONS, REFERRAL_STATUSES, URGENCIES, type ReferralDirection } from '@/lib/referrals';

const text = (max: number) => z.string().trim().max(max).optional();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date (yyyy-mm-dd)')
  .optional()
  .or(z.literal(''));

/** The details staff write on a referral (create and edit). Tenant, code, state and reminder markers are server-controlled. */
export const referralDetailsSchema = z.object({
  direction: z.enum(DIRECTIONS),
  referringDoctor: zObjectId.optional().or(z.literal('')),
  referringPatient: zObjectId.optional().or(z.literal('')),
  referringClinic: text(200),
  referringContact: z
    .object({ name: text(200), phone: text(40), email: text(254) })
    .optional(),
  receivingDoctor: zObjectId.optional().or(z.literal('')),
  receivingClinic: text(200),
  reason: z.string().trim().min(1, 'Say why the patient is being referred').max(4000),
  urgency: z.enum(URGENCIES).default('routine'),
  specialty: text(200),
  notes: text(4000),
  chiefComplaint: text(2000),
  diagnosis: text(2000),
  relevantHistory: text(8000),
  medications: z.array(z.string().trim().max(300)).max(50).optional(),
  visit: zObjectId.optional().or(z.literal('')),
  followUpRequired: z.boolean().optional(),
  followUpDate: day,
  followUpNotes: text(2000),
});

export const createReferralSchema = referralDetailsSchema.extend({ patient: zObjectId });

/** A state change: the only way `status` moves, one allowed step at a time (see NEXT_STATUS). */
export const referralStatusSchema = z.object({
  status: z.enum(REFERRAL_STATUSES),
  declinedReason: text(2000),
  /** "Seen on" for a completed referral (defaults to now; never in the future). */
  completedOn: day,
  visit: zObjectId.optional().or(z.literal('')),
});

type Details = z.infer<typeof referralDetailsSchema>;

/** Date-only input stored at noon UTC, so it reads as the same calendar day in any clinic time zone. */
export const dayToDate = (d: string) => new Date(`${d}T12:00:00Z`);

const TYPE_OF: Record<ReferralDirection, 'doctor_to_doctor' | 'external' | 'patient_to_patient'> = {
  internal: 'doctor_to_doctor',
  out: 'external',
  in: 'external',
  patient: 'patient_to_patient',
};

/**
 * Turn the form's details into stored fields for its direction: what the direction needs is
 * required, what belongs to another direction is removed (so `directionOf` reads it back the same).
 * Returns `$set`/`$unset` for an edit, or a list of problems.
 */
export function normalizeReferral(d: Details, patientId?: string): { set: Record<string, unknown>; unset: string[]; problems: { path: string; message: string }[] } {
  const problems: { path: string; message: string }[] = [];
  const set: Record<string, unknown> = { type: TYPE_OF[d.direction], reason: d.reason, urgency: d.urgency };
  const unset: string[] = [];
  const keep = (key: string, value: unknown) => {
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) unset.push(key);
    else set[key] = value;
  };
  const drop = (...keys: string[]) => unset.push(...keys);

  const contactName = d.referringContact?.name?.trim() ?? '';
  switch (d.direction) {
    case 'internal':
      if (!d.receivingDoctor) problems.push({ path: 'receivingDoctor', message: 'Choose the doctor the patient is going to' });
      if (d.receivingDoctor && d.receivingDoctor === d.referringDoctor) problems.push({ path: 'receivingDoctor', message: 'A doctor can’t refer a patient to themselves' });
      keep('referringDoctor', d.referringDoctor);
      keep('receivingDoctor', d.receivingDoctor);
      drop('referringPatient', 'referringClinic', 'referringContact', 'receivingClinic');
      break;
    case 'out':
      if (!d.receivingClinic) problems.push({ path: 'receivingClinic', message: 'Name the clinic, hospital or specialist' });
      keep('referringDoctor', d.referringDoctor);
      keep('receivingClinic', d.receivingClinic);
      drop('referringPatient', 'referringClinic', 'referringContact', 'receivingDoctor');
      break;
    case 'in':
      if (!d.referringClinic && !contactName) problems.push({ path: 'referringClinic', message: 'Name the clinic or the person who sent the patient' });
      keep('referringClinic', d.referringClinic);
      if (contactName) {
        set.referringContact = {
          name: contactName,
          ...(d.referringContact?.phone ? { phone: d.referringContact.phone } : {}),
          ...(d.referringContact?.email ? { email: d.referringContact.email } : {}),
        };
      } else drop('referringContact');
      keep('receivingDoctor', d.receivingDoctor);
      // A sender doctor would make this read as "sent out".
      drop('referringDoctor', 'referringPatient', 'receivingClinic');
      break;
    case 'patient':
      if (!d.referringPatient) problems.push({ path: 'referringPatient', message: 'Choose the patient who recommended the clinic' });
      if (d.referringPatient && patientId && d.referringPatient === patientId) problems.push({ path: 'referringPatient', message: 'A patient can’t recommend themselves' });
      keep('referringPatient', d.referringPatient);
      keep('receivingDoctor', d.receivingDoctor);
      drop('referringDoctor', 'referringClinic', 'referringContact', 'receivingClinic');
      break;
  }

  keep('specialty', d.specialty);
  keep('notes', d.notes);
  keep('chiefComplaint', d.chiefComplaint);
  keep('diagnosis', d.diagnosis);
  keep('relevantHistory', d.relevantHistory);
  keep('medications', (d.medications ?? []).filter(Boolean));
  keep('visit', d.visit);
  set.followUpRequired = Boolean(d.followUpRequired);
  if (d.followUpRequired && d.followUpDate) set.followUpDate = dayToDate(d.followUpDate);
  else unset.push('followUpDate');
  keep('followUpNotes', d.followUpRequired ? d.followUpNotes : '');

  return { set, unset: [...new Set(unset)].filter((k) => !(k in set)), problems };
}

export function referralPopulate(tenantObjectId: Types.ObjectId, patientSelect = 'firstName lastName patientCode') {
  const doctor = (path: string) => ({
    path,
    select: 'firstName lastName title specializationId',
    populate: { path: 'specializationId', select: 'name' },
    match: { tenantId: tenantObjectId },
  });
  return [
    doctor('referringDoctor'),
    doctor('receivingDoctor'),
    { path: 'patient', select: patientSelect, match: { tenantIds: tenantObjectId } },
    { path: 'referringPatient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } },
  ];
}

/** Linked records in a referral body must belong to the caller's clinic, and a visit to the patient. */
export async function validateReferralRefs(data: Record<string, any>, tenantObjectId: Types.ObjectId, patientId?: string): Promise<string | null> {
  const checks: Array<[string, () => Promise<unknown>]> = [
    ['patient', () => Patient.exists({ _id: data.patient, tenantIds: tenantObjectId })],
    ['referringPatient', () => Patient.exists({ _id: data.referringPatient, tenantIds: tenantObjectId })],
    ['referringDoctor', () => Doctor.exists({ _id: data.referringDoctor, tenantId: tenantObjectId })],
    ['receivingDoctor', () => Doctor.exists({ _id: data.receivingDoctor, tenantId: tenantObjectId })],
    ['visit', () => Visit.exists({ _id: data.visit, tenantId: tenantObjectId, ...(patientId ? { patient: patientId } : {}) })],
    ['appointment', () => Appointment.exists({ _id: data.appointment, tenantId: tenantObjectId })],
  ];
  for (const [key, check] of checks) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (!isValidId(value) || !(await check())) {
      if (key === 'patient') return 'Invalid patient selected. Please select a patient from this clinic.';
      if (key === 'referringPatient') return 'The recommending patient isn’t a patient of this clinic.';
      if (key.endsWith('Doctor')) return `Invalid ${key === 'referringDoctor' ? 'referring' : 'receiving'} doctor selected. Please select a doctor from this clinic.`;
      if (key === 'visit') return 'That visit isn’t one of this patient’s visits.';
      return `Invalid ${key}`;
    }
  }
  return null;
}
