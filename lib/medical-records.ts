import 'server-only';
import { Types } from 'mongoose';
import { TZDate } from '@date-fns/tz';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import { dayRangeInTz, resolveTimezone } from '@/lib/tz';

/**
 * The chart a released medical records copy contains (models/DocumentRequest.ts, kind
 * `medical_records`). Request rules shared with other kinds are in lib/document-requests.ts.
 */

/** Upper bound per section, so one copy stays a PDF Chromium can print in time. */
export const RECORDS_SECTION_LIMIT = 300;

/** [start, end] of the clinic-local calendar day "yyyy-MM-dd". */
function localDay(ymd: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = ymd.split('-').map(Number);
  return dayRangeInTz(new TZDate(y, m - 1, d, 12, 0, 0, resolveTimezone(tz)), tz);
}

/**
 * The instants a copy covers: from the start of `periodFrom` (or the beginning) to the end of
 * `periodTo`, never past the release cutoff.
 */
export function coveredRange(
  r: { periodFrom?: string | null; periodTo?: string | null; cutoff?: Date | null },
  tz: string,
  now = new Date()
): { $gte?: Date; $lte: Date } {
  const cutoff = r.cutoff ? new Date(r.cutoff) : now;
  const end = r.periodTo ? localDay(r.periodTo, tz).end : cutoff;
  return {
    ...(r.periodFrom ? { $gte: localDay(r.periodFrom, tz).start } : {}),
    $lte: end.getTime() < cutoff.getTime() ? end : cutoff,
  };
}

export type MedicalRecords = {
  patient: any;
  visits: any[];
  prescriptions: any[];
  labResults: any[];
  /** A section hit RECORDS_SECTION_LIMIT; the copy says so. */
  truncated: boolean;
};

/**
 * The chart a copy contains: the patient's record at the request's clinic, with the visits,
 * prescriptions and lab results dated within the covered range. Drafts, cancelled items and the
 * fields the patient API never returns (signature images, staff notes, lab integration
 * secrets, attachment contents) are left out. Null when the record is gone.
 */
export async function loadMedicalRecords(
  r: { tenantId: unknown; patient: unknown; periodFrom?: string | null; periodTo?: string | null; cutoff?: Date | null },
  tz: string,
  now = new Date()
): Promise<MedicalRecords | null> {
  await connectDB();
  const tenantId = new Types.ObjectId(String(r.tenantId));
  const patientId = new Types.ObjectId(String((r.patient as any)?._id ?? r.patient));
  const range = coveredRange(r, tz, now);

  const patient = await Patient.findOne({ _id: patientId, tenantIds: tenantId })
    .select('firstName middleName lastName suffix dateOfBirth sex patientCode allergies preExistingConditions immunizations')
    .lean<any>();
  if (!patient) return null;

  const scope = { tenantId, patient: patientId };
  const limit = RECORDS_SECTION_LIMIT + 1;
  const [visits, prescriptions, labResults] = await Promise.all([
    Visit.find({ ...scope, date: range, status: { $in: ['open', 'closed'] } })
      .select(
        'visitCode date visitType chiefComplaint historyOfPresentIllness vitals physicalExam diagnoses assessment plan soapNotes treatmentPlan.followUp followUpDate provider status'
      )
      .populate({ path: 'provider', select: 'name' })
      .sort({ date: 1 })
      .limit(limit)
      .lean<any[]>(),
    Prescription.find({ ...scope, issuedAt: range, status: { $ne: 'cancelled' } })
      .select('prescriptionCode issuedAt medications prescribedBy status')
      .populate({ path: 'prescribedBy', select: 'name' })
      .sort({ issuedAt: 1 })
      .limit(limit)
      .lean<any[]>(),
    LabResult.find({ ...scope, orderDate: range, status: { $ne: 'cancelled' } })
      .select('requestCode orderDate resultDate request.testType request.description results referenceRanges abnormalFlags interpretation status')
      .sort({ orderDate: 1 })
      .limit(limit)
      .lean<any[]>(),
  ]);

  const truncated = [visits, prescriptions, labResults].some((rows) => rows.length > RECORDS_SECTION_LIMIT);
  return {
    patient,
    visits: visits.slice(0, RECORDS_SECTION_LIMIT),
    prescriptions: prescriptions.slice(0, RECORDS_SECTION_LIMIT),
    labResults: labResults.slice(0, RECORDS_SECTION_LIMIT),
    truncated,
  };
}
