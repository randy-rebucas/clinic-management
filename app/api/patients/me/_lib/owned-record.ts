import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { patientAuthError, verifyPatientAuth, type PatientSessionPayload } from '@/app/lib/patient-auth';
import { isValidId } from '@/lib/api/tenant-session';
import { tenantScopeFilter } from './patient-scope';
import { linkedRecords, type LinkedRecords } from './linked-records';

export type OwnedRecordContext = {
  session: PatientSessionPayload;
  /** The signed-in record; `tenantIds` is the union over its linked records. */
  patient: { _id: unknown; email?: string; tenantIds?: unknown[] };
  linked: LinkedRecords;
  /** Filter for one record of this patient's, at one of their clinics. */
  filter: Record<string, unknown>;
};

/**
 * Shared front half of the `/api/patients/me/<resource>/[id]` detail routes: authenticate
 * (cookie or Bearer), refuse inactive patients, validate the id and build an ownership filter
 * that matches the list routes (own records, at the patient's clinics).
 */
export async function ownedRecordContext(
  request: NextRequest,
  id: string,
  notFoundLabel: string
): Promise<OwnedRecordContext | NextResponse> {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  await connectDB();

  const patient = await Patient.findById(session.patientId)
    .select('active email tenantIds accountId')
    .lean<{ _id: unknown; active?: boolean; email?: string; tenantIds?: unknown[]; accountId?: unknown } | null>();
  if (!patient) {
    return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
  }
  if (patient.active === false) {
    await recordPatientRefused(patient, request, 'access');
    return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
  }

  if (!isValidId(id)) {
    return NextResponse.json({ success: false, error: `${notFoundLabel} not found.` }, { status: 404 });
  }

  // Own record (on any of this person's linked records), at their clinics (narrowed to the
  // session's clinic when it carries one).
  const linked = await linkedRecords(patient);
  const filter: Record<string, unknown> = {
    _id: id,
    patient: { $in: linked.patientIds },
    ...tenantScopeFilter(linked.tenantIds, session),
  };

  return { session, patient: { ...patient, tenantIds: linked.tenantIds }, linked, filter };
}

export function isOwnedRecordError(value: OwnedRecordContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function recordNotFound(label: string) {
  return NextResponse.json({ success: false, error: `${label} not found.` }, { status: 404 });
}
