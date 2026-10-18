import 'server-only';
import '@/models/Specialization'; // registered for the nested populate

/**
 * Doctor fields shown to patients. Doctor stores `specializationId` (ref Specialization), not a
 * `specialization` string, so selecting `specialization` always came back empty.
 */
export const PATIENT_DOCTOR_POPULATE = {
  path: 'doctor',
  select: 'firstName lastName specializationId',
  populate: { path: 'specializationId', select: 'name' },
};

/** `{ _id, firstName, lastName, specialization }` from a doctor populated as above. */
export function doctorSummary<T extends Record<string, any> | null | undefined>(doctor: T) {
  if (!doctor || typeof doctor !== 'object' || !('firstName' in doctor)) return doctor ?? null;
  const { specializationId, ...rest } = doctor as Record<string, any>;
  return {
    ...rest,
    specialization: specializationId && typeof specializationId === 'object' ? specializationId.name ?? null : null,
  };
}

/** Replace a populated `doctor` on an appointment-like record with doctorSummary(). */
export function withDoctorSummary<T extends Record<string, any>>(record: T): T {
  return record && 'doctor' in record ? { ...record, doctor: doctorSummary(record.doctor) } : record;
}
