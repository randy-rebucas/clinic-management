import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import DocumentRequest from '@/models/DocumentRequest';
import { linkedRecords, type LinkedRecords } from '../../_lib/linked-records';
import { scopedTenantIds } from '../../_lib/patient-scope';

type PatientLean = { _id: unknown; active?: boolean; email?: string; tenantIds?: unknown[]; accountId?: unknown };

/** The signed-in, active patient and their linked records, or the response to send instead. */
export async function signedInPatient(
  request: NextRequest,
  patientId: string
): Promise<{ patient: PatientLean; linked: LinkedRecords } | NextResponse> {
  await connectDB();
  const patient = await Patient.findById(patientId).select('active email tenantIds accountId').lean<PatientLean | null>();
  if (!patient) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
  if (patient.active === false) {
    await recordPatientRefused(patient as any, request, 'access');
    return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
  }
  return { patient, linked: await linkedRecords(patient) };
}

export const requestNotFound = () => NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

/** One of this person's document requests, at a clinic the session can see. Null otherwise. */
export async function ownedDocumentRequest(
  id: string,
  linked: LinkedRecords,
  session: { tid?: string | null }
): Promise<Record<string, any> | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const scope = scopedTenantIds(linked.tenantIds, session);
  return DocumentRequest.findOne({
    _id: new Types.ObjectId(id),
    patient: { $in: linked.patientIds },
    ...(scope ? { tenantId: { $in: scope } } : {}),
  }).lean<Record<string, any> | null>();
}
