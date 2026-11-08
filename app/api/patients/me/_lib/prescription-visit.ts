import '@/models/Visit';
import { PATIENT_VISIT_VISIBLE } from './visit-fields';

/**
 * The visit fields a patient's prescription carries, so the app can group
 * prescriptions by encounter. Header data only: no clinical notes, signatures
 * or draft content.
 *
 * The populate only resolves a visit that belongs to the same patient (and, when given,
 * one of the clinics in scope); a mis-linked visit comes back as `null` rather than leaking
 * another patient's encounter header.
 */
export function prescriptionVisitPopulate(patientId: unknown, tenantFilter: Record<string, unknown> = {}) {
  return {
    path: 'visit',
    select: 'date visitType visitCode',
    // A draft visit's header stays hidden (null) like the visits routes hide it.
    match: { patient: Array.isArray(patientId) ? { $in: patientId } : patientId, ...tenantFilter, ...PATIENT_VISIT_VISIBLE },
  };
}

/** Prescriber fields shown to patients. `prescribedBy` refs User, which stores `name` (not first/last). */
export const PRESCRIBER_POPULATE = { path: 'prescribedBy', select: 'name' } as const;
