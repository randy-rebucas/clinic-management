import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import { isValidId } from '@/lib/api/tenant-session';

/** Fields staff may set on a referral (tenant, code and reminder markers are server-controlled). */
export const REFERRAL_FIELDS = [
  'type', 'referringDoctor', 'referringPatient', 'referringClinic', 'referringContact', 'receivingDoctor',
  'receivingClinic', 'patient', 'reason', 'urgency', 'specialty', 'notes', 'chiefComplaint', 'diagnosis',
  'relevantHistory', 'medications', 'attachments', 'status', 'referredDate', 'acceptedDate', 'completedDate',
  'declinedDate', 'declinedReason', 'visit', 'appointment', 'followUpRequired', 'followUpDate', 'followUpNotes',
  'feedback',
] as const;

export function referralPopulate(tenantObjectId: Types.ObjectId) {
  const doctor = (path: string) => ({
    path,
    select: 'firstName lastName specializationId',
    populate: { path: 'specializationId', select: 'name' },
    match: { tenantId: tenantObjectId },
  });
  return [
    doctor('referringDoctor'),
    doctor('receivingDoctor'),
    { path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } },
  ];
}

/** Linked records in a referral body must belong to the caller's clinic. */
export async function validateReferralRefs(data: Record<string, any>, tenantObjectId: Types.ObjectId): Promise<string | null> {
  const checks: Array<[string, () => Promise<unknown>]> = [
    ['patient', () => Patient.exists({ _id: data.patient, tenantIds: tenantObjectId })],
    ['referringPatient', () => Patient.exists({ _id: data.referringPatient, tenantIds: tenantObjectId })],
    ['referringDoctor', () => Doctor.exists({ _id: data.referringDoctor, tenantId: tenantObjectId })],
    ['receivingDoctor', () => Doctor.exists({ _id: data.receivingDoctor, tenantId: tenantObjectId })],
    ['visit', () => Visit.exists({ _id: data.visit, tenantId: tenantObjectId })],
    ['appointment', () => Appointment.exists({ _id: data.appointment, tenantId: tenantObjectId })],
  ];
  for (const [key, check] of checks) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (!isValidId(value) || !(await check())) {
      return key === 'patient'
        ? 'Invalid patient selected. Please select a patient from this clinic.'
        : key.endsWith('Doctor')
        ? `Invalid ${key === 'referringDoctor' ? 'referring' : 'receiving'} doctor selected. Please select a doctor from this clinic.`
        : `Invalid ${key}`;
    }
  }
  return null;
}
