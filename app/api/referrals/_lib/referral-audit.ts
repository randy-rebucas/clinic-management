import 'server-only';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { createAuditLog } from '@/lib/audit';
import type { TenantSession } from '@/lib/api/tenant-session';
import { DIRECTION_LABEL, directionOf } from '@/lib/referrals';
import { doctorLabel } from '@/app/api/doctors/_lib/doctor-audit';
import { patientLabel } from '@/app/api/patients/_lib/patient-audit';

/**
 * How referrals reach the audit log. Every entry names the referred patient as the data subject.
 *
 * Who the referral is between, its urgency, follow-up and linked visit are logged with before
 * and after values in words (doctors and patients by name, the visit by its code, dates as
 * days). The clinical text (reason, complaint, diagnosis, history, medicines, notes, why it was
 * declined) is logged as changed without its contents: the referral keeps it, and the log and
 * its archives shouldn't hold a second copy.
 */

type Snapshot = Record<string, any>;
type Change = { field: string; oldValue: unknown; newValue: unknown };

/** Fields as the form names them, in the order it shows them. */
const FIELDS: Record<string, string> = {
  direction: 'direction',
  referringDoctor: 'referring doctor',
  referringPatient: 'recommending patient',
  referringClinic: 'referring clinic',
  referringContact: 'referring contact',
  receivingDoctor: 'receiving doctor',
  receivingClinic: 'receiving clinic',
  urgency: 'urgency',
  specialty: 'specialty',
  reason: 'reason',
  chiefComplaint: 'chief complaint',
  diagnosis: 'diagnosis',
  relevantHistory: 'history',
  medications: 'medicines',
  notes: 'notes',
  status: 'status',
  declinedReason: 'reason declined',
  completedDate: 'date seen',
  visit: 'linked visit',
  followUpRequired: 'follow-up',
  followUpDate: 'follow-up date',
  followUpNotes: 'follow-up notes',
};

const CLINICAL = new Set(['reason', 'chiefComplaint', 'diagnosis', 'relevantHistory', 'medications', 'notes', 'declinedReason', 'followUpNotes']);
const CLINICAL_NOTE = 'Clinical information, not copied to the log';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for a reply',
  accepted: 'Accepted',
  completed: 'Seen',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
const URGENCY_LABEL: Record<string, string> = { routine: 'Routine', urgent: 'Urgent', stat: 'STAT' };

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const idOf = (v: any) => (v && typeof v === 'object' && '_id' in v ? v._id : v);

/** Comparable form: dates as days, ids as strings, empty contact parts dropped. */
function normal(field: string, v: unknown): unknown {
  if (blank(v)) return null;
  if (['referringDoctor', 'referringPatient', 'receivingDoctor', 'visit'].includes(field)) return String(idOf(v));
  if (v instanceof Date) return v.toISOString();
  if (field === 'referringContact' && typeof v === 'object') {
    const c = v as Record<string, unknown>;
    const parts = ['name', 'phone', 'email'].map((k) => (typeof c[k] === 'string' ? (c[k] as string).trim() : '')).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (Array.isArray(v)) return JSON.stringify(v);
  return v;
}

/**
 * "Nov 3, 2026" in the clinic's time zone. A day someone picked is stored at noon UTC, so it
 * reads the same anywhere; "seen" without a date is the moment it was marked.
 */
const dayWords = (iso: unknown, tz: string) =>
  blank(iso) ? null : new Date(String(iso)).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' });

const validIds = (values: unknown[]) =>
  [...new Set(values.filter((v) => !blank(v)).map((v) => String(idOf(v))))].filter((v) => Types.ObjectId.isValid(v));

/** Doctors, patients and visits by id, as names and visit codes. */
async function namesFor(tenantObjectId: Types.ObjectId, ids: { doctors?: unknown[]; patients?: unknown[]; visits?: unknown[] }) {
  const doctorIds = validIds(ids.doctors ?? []);
  const patientIds = validIds(ids.patients ?? []);
  const visitIds = validIds(ids.visits ?? []);
  const [doctors, patients, visits] = await Promise.all([
    doctorIds.length ? Doctor.find({ tenantId: tenantObjectId, _id: { $in: doctorIds } }).select('title firstName lastName').lean<any[]>() : [],
    patientIds.length ? Patient.find({ tenantIds: tenantObjectId, _id: { $in: patientIds } }).select('firstName lastName suffix').lean<any[]>() : [],
    visitIds.length ? Visit.find({ tenantId: tenantObjectId, _id: { $in: visitIds } }).select('visitCode').lean<any[]>() : [],
  ]);
  return new Map<string, string>([
    ...doctors.map((d) => [String(d._id), doctorLabel(d)] as [string, string]),
    ...patients.map((p) => [String(p._id), patientLabel(p)] as [string, string]),
    ...visits.map((v) => [String(v._id), v.visitCode] as [string, string]),
  ]);
}

/**
 * What changed between two versions of a referral, for the fields a request wrote (set or
 * cleared). Values are in words; clinical text is named, not copied.
 */
export async function referralChanges(
  tenantObjectId: Types.ObjectId,
  before: Snapshot,
  after: Snapshot,
  fields: Iterable<string>,
  tz: string
): Promise<Change[]> {
  const written = new Set(fields);
  const raw: Change[] = [];

  // The direction is stored as a type plus who is on each side; it reads as one field.
  const was = directionOf(before);
  const now = directionOf(after);
  if (written.has('type') && was !== now) {
    raw.push({ field: 'direction', oldValue: DIRECTION_LABEL[was].label, newValue: DIRECTION_LABEL[now].label });
  }

  for (const field of Object.keys(FIELDS)) {
    if (field === 'direction' || !written.has(field)) continue;
    const a = normal(field, before[field]);
    const b = normal(field, after[field]);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    raw.push(CLINICAL.has(field) ? { field, oldValue: CLINICAL_NOTE, newValue: CLINICAL_NOTE } : { field, oldValue: a, newValue: b });
  }

  const values = (...fs: string[]) => raw.filter((c) => fs.includes(c.field)).flatMap((c) => [c.oldValue, c.newValue]);
  const names = await namesFor(tenantObjectId, {
    doctors: values('referringDoctor', 'receivingDoctor'),
    patients: values('referringPatient'),
    visits: values('visit'),
  });
  const named = (v: unknown, gone: string) => (blank(v) ? null : names.get(String(v)) ?? gone);

  return raw.map((c) => {
    switch (c.field) {
      case 'referringDoctor':
      case 'receivingDoctor':
        return { ...c, oldValue: named(c.oldValue, 'A doctor no longer on file'), newValue: named(c.newValue, 'A doctor no longer on file') };
      case 'referringPatient':
        return { ...c, oldValue: named(c.oldValue, 'A patient no longer on file'), newValue: named(c.newValue, 'A patient no longer on file') };
      case 'visit':
        return { ...c, oldValue: named(c.oldValue, 'A visit no longer on file'), newValue: named(c.newValue, 'A visit no longer on file') };
      case 'status':
        return { ...c, oldValue: STATUS_LABEL[String(c.oldValue)] ?? c.oldValue, newValue: STATUS_LABEL[String(c.newValue)] ?? c.newValue };
      case 'urgency':
        return { ...c, oldValue: URGENCY_LABEL[String(c.oldValue)] ?? c.oldValue, newValue: URGENCY_LABEL[String(c.newValue)] ?? c.newValue };
      case 'followUpDate':
      case 'completedDate':
        return { ...c, oldValue: dayWords(c.oldValue, tz), newValue: dayWords(c.newValue, tz) };
      case 'followUpRequired':
        return { ...c, oldValue: c.oldValue ? 'Needed' : 'Not needed', newValue: c.newValue ? 'Needed' : 'Not needed' };
      default:
        return c;
    }
  });
}

/** "Edited referral REF-0012: receiving doctor, urgency". */
export const changedSentence = (code: string, changes: Change[]) =>
  `Edited referral ${code}: ${changes.map((c) => FIELDS[c.field] ?? c.field).join(', ')}`;

/**
 * Who the new referral is to or from, for "Referred to Dr. Ana Reyes (REF-0012)". The parties are
 * looked up by id; a name typed in (another clinic, a contact) is used as written.
 */
export async function partiesWords(tenantObjectId: Types.ObjectId, r: Snapshot): Promise<string> {
  const direction = directionOf(r);
  const names = await namesFor(tenantObjectId, { doctors: [r.receivingDoctor], patients: [r.referringPatient] });
  const name = (v: unknown) => (blank(v) ? null : names.get(String(idOf(v))) ?? null);
  switch (direction) {
    case 'internal':
      return `Referred the patient to ${name(r.receivingDoctor) ?? 'a doctor here'}`;
    case 'out':
      return `Referred the patient to ${r.receivingClinic?.trim() || 'another clinic'}`;
    case 'in':
      return `Recorded a referral from ${r.referringClinic?.trim() || r.referringContact?.name?.trim() || 'another clinic'}`;
    case 'patient':
      return `Recorded a patient’s recommendation from ${name(r.referringPatient) ?? 'another patient'}`;
  }
}

export async function logReferral(
  ctx: TenantSession,
  request: NextRequest,
  entry: {
    action: 'create' | 'update';
    referralId: unknown;
    patientId: unknown;
    description: string;
    changes?: Change[];
    metadata?: Record<string, unknown>;
  }
) {
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: entry.action,
    resource: 'referral',
    resourceId: String(entry.referralId),
    dataSubject: entry.patientId ? String(idOf(entry.patientId)) : undefined,
    isSensitive: true,
    description: entry.description,
    changes: entry.changes?.length ? entry.changes : undefined,
    metadata: entry.metadata,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
