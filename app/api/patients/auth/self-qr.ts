import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { normalizePhone } from '@/lib/phone';
import { isMinor } from '@/lib/patient-family';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';
import { DEFAULT_TIMEZONE, formatInTz } from '@/lib/tz';
import { phoneFilter } from './shared';

/**
 * Self-serve sign-in QR / invite slip (public /my-qr page and the clinic kiosk). The caller proves
 * the phone with an SMS code (POST /api/patients/self-qr/verify → ticket), then answers questions
 * about one record on that phone: name, birth date, patient code, last visit date and doctor. Only
 * then is a QR issued for that record (POST /api/patients/self-qr/issue).
 */

/** Server lifetime of a self-serve sign-in QR: the page shows it 45 s (+30 s once). */
export const SELF_QR_TTL_SECONDS = 90;
const TICKET_PURPOSE = 'patient-self-qr';
const TICKET_TTL_MS = 10 * 60 * 1000;
const MAX_PEOPLE = 10;
const MAX_DOCTORS = 8;
/** Visits / prescriptions whose date and doctor count as "your last visit". */
const RECENT_EVENTS = 3;

export type SelfQrTicket = { phone: string; tenantId?: string };

/** A ticket proving `phone` (E.164) was verified in the last 10 minutes, optionally for one clinic. */
export function createSelfQrTicket(phone: string, tenantId?: string | null) {
  return createSignedLinkToken(TICKET_PURPOSE, [phone, tenantId || '-'], TICKET_TTL_MS);
}

export function readSelfQrTicket(token: unknown): SelfQrTicket | null {
  if (typeof token !== 'string' || token.length > 1000) return null;
  const parts = readSignedLinkToken(TICKET_PURPOSE, token, 2);
  if (!parts) return null;
  const [phone, tenantId] = parts;
  if (!normalizePhone(phone)) return null;
  return tenantId === '-' ? { phone } : { phone, tenantId };
}

export function ticketExpiredResponse() {
  return NextResponse.json(
    { success: false, code: 'TICKET_EXPIRED', error: 'This step timed out. Please start again.' },
    { status: 401 }
  );
}

// ── Answers ───────────────────────────────────────────────────────────────────

/** "  José  Dela-Cruz " → "jose dela cruz" */
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** First names match in full or on the first word ("Maria Clara" vs "Maria"). */
export function firstNameMatches(answer: unknown, stored: unknown): boolean {
  const a = normalizeName(answer);
  const s = normalizeName(stored);
  if (!a || !s) return false;
  return a === s || a.split(' ')[0] === s.split(' ')[0];
}

/** Last names match ignoring case, accents, spaces and dashes ("Dela Cruz" = "delacruz"). */
export function lastNameMatches(answer: unknown, stored: unknown): boolean {
  const a = normalizeName(answer).replace(/ /g, '');
  return !!a && a === normalizeName(stored).replace(/ /g, '');
}

/** "clinic-0001 " → "CLINIC0001" */
export function normalizePatientCode(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days between a stored date (as the clinic prints it) and a "YYYY-MM-DD" answer. */
function dayDistance(stored: Date, answer: string): number {
  const local = formatInTz(stored, 'yyyy-MM-dd', DEFAULT_TIMEZONE);
  return Math.abs(Date.parse(`${local}T00:00:00Z`) - Date.parse(`${answer}T00:00:00Z`)) / 86_400_000;
}

/** Birth dates are stored as UTC midnight; accept that date or the clinic-local one. */
export function birthDateMatches(answer: unknown, stored: unknown): boolean {
  if (typeof answer !== 'string' || !YMD.test(answer) || !stored) return false;
  const dob = new Date(stored as string | Date);
  if (isNaN(dob.getTime())) return false;
  return dob.toISOString().slice(0, 10) === answer || dayDistance(dob, answer) === 0;
}

export type VisitEvent = { date: Date; providerId?: string };

/** The last visit answer: one recent visit or prescription on that date (±1 day) with that doctor. */
export function lastVisitMatches(events: VisitEvent[], date: unknown, doctorId: unknown): boolean {
  if (typeof date !== 'string' || !YMD.test(date) || typeof doctorId !== 'string' || !doctorId) return false;
  return events.some((e) => e.providerId === doctorId && dayDistance(e.date, date) <= 1);
}

export type SelfQrAnswers = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  patientCode?: string;
  lastVisitDate: string;
  doctorId: string;
};

type AnswerRecord = { firstName?: string; lastName?: string; dateOfBirth?: unknown; patientCode?: string | null };

/** Every answer must match; the caller is never told which one did not. */
export function answersMatch(record: AnswerRecord, events: VisitEvent[], answers: SelfQrAnswers): boolean {
  const codeOk = record.patientCode
    ? normalizePatientCode(answers.patientCode) === normalizePatientCode(record.patientCode)
    : true;
  return (
    firstNameMatches(answers.firstName, record.firstName) &&
    lastNameMatches(answers.lastName, record.lastName) &&
    birthDateMatches(answers.dateOfBirth, record.dateOfBirth) &&
    codeOk &&
    lastVisitMatches(events, answers.lastVisitDate, answers.doctorId)
  );
}

// ── People on a phone ─────────────────────────────────────────────────────────

export type SelfServePerson = {
  id: string;
  /** "Maria D." */
  name: string;
  relation: 'self' | 'child';
  clinicName: string;
  tenantId?: string;
  /** The record has a patient code to ask for. */
  hasPatientCode: boolean;
};

type PersonLean = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  patientCode?: string;
  tenantIds?: Types.ObjectId[];
};

const PERSON_FIELDS = 'firstName lastName phone dateOfBirth patientCode tenantIds';

function shortName(first?: string, last?: string): string {
  const initial = last?.trim()?.[0];
  return [first?.trim(), initial ? `${initial.toUpperCase()}.` : ''].filter(Boolean).join(' ') || 'Patient';
}

/**
 * Records a verified phone may get a QR for, the same people a phone-code sign-in reaches
 * (otp-scope.ts): adults whose own number it is, and minors who have it as their own or as a
 * contact number. An adult reached only through a contact number is never listed.
 */
export async function selfServeRecords(phone: string, tenantId?: string): Promise<PersonLean[]> {
  await connectDB();
  const scope: Record<string, unknown> = { active: { $ne: false } };
  if (tenantId) scope.tenantIds = new Types.ObjectId(tenantId);
  const proven = normalizePhone(phone);

  const records = await Patient.find({ ...phoneFilter(phone), ...scope })
    .select(PERSON_FIELDS)
    .sort({ updatedAt: -1 })
    .limit(MAX_PEOPLE * 2)
    .lean<PersonLean[]>();

  return records
    .filter((r) => isMinor(r.dateOfBirth) || (!!r.phone && normalizePhone(r.phone) === proven))
    .slice(0, MAX_PEOPLE);
}

export function relationOf(record: { dateOfBirth?: unknown }): 'self' | 'child' {
  return isMinor(record.dateOfBirth) ? 'child' : 'self';
}

/** The record's clinic: the kiosk's own, else the first the record belongs to. */
export function recordTenantId(record: { tenantIds?: Types.ObjectId[] }, ticketTenantId?: string): string | undefined {
  return ticketTenantId ?? (record.tenantIds?.[0] ? String(record.tenantIds[0]) : undefined);
}

export async function selfServePeople(phone: string, tenantId?: string): Promise<SelfServePerson[]> {
  const records = await selfServeRecords(phone, tenantId);
  const tenantIds = [...new Set(records.map((r) => recordTenantId(r, tenantId)).filter(Boolean))] as string[];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select('name displayName')
    .lean<{ _id: Types.ObjectId; name?: string; displayName?: string }[]>();
  const names = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || 'Your clinic']));

  return records.map((r) => {
    const tid = recordTenantId(r, tenantId);
    return {
      id: String(r._id),
      name: shortName(r.firstName, r.lastName),
      relation: relationOf(r),
      clinicName: (tid && names.get(tid)) || 'Your clinic',
      tenantId: tid,
      hasPatientCode: !!r.patientCode,
    };
  });
}

/** The record if it is one this ticket may get a QR for, else null. */
export async function eligibleRecord(ticket: SelfQrTicket, patientId: unknown): Promise<PersonLean | null> {
  if (typeof patientId !== 'string' || !Types.ObjectId.isValid(patientId)) return null;
  const records = await selfServeRecords(ticket.phone, ticket.tenantId);
  return records.find((r) => String(r._id) === patientId) ?? null;
}

// ── Last visit ────────────────────────────────────────────────────────────────

/** The person's last few visits and prescriptions: date and doctor. */
export async function recentVisitEvents(patientId: Types.ObjectId, tenantId?: string): Promise<VisitEvent[]> {
  await connectDB();
  const filter: Record<string, unknown> = { patient: patientId };
  if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
  const [visits, prescriptions] = await Promise.all([
    Visit.find({ ...filter, status: { $ne: 'cancelled' } })
      .select('date provider')
      .sort({ date: -1 })
      .limit(RECENT_EVENTS)
      .lean<{ date: Date; provider?: Types.ObjectId }[]>(),
    Prescription.find({ ...filter, status: { $ne: 'cancelled' } })
      .select('issuedAt prescribedBy')
      .sort({ issuedAt: -1 })
      .limit(RECENT_EVENTS)
      .lean<{ issuedAt: Date; prescribedBy?: Types.ObjectId }[]>(),
  ]);
  return [
    ...visits.map((v) => ({ date: v.date, providerId: v.provider ? String(v.provider) : undefined })),
    ...prescriptions.map((p) => ({ date: p.issuedAt, providerId: p.prescribedBy ? String(p.prescribedBy) : undefined })),
  ].filter((e) => e.date);
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Doctors to pick from for "who did you see?": the ones on the person's recent visits plus others
 * who saw patients at the same clinic, shuffled, so the list alone doesn't give the answer away.
 */
export async function doctorChoices(
  record: { _id: Types.ObjectId; tenantIds?: Types.ObjectId[] },
  ticketTenantId?: string
): Promise<{ id: string; name: string }[]> {
  await connectDB();
  const events = await recentVisitEvents(record._id, ticketTenantId);
  const actual = [...new Set(events.map((e) => e.providerId).filter(Boolean))] as string[];
  if (!actual.length) return [];

  const tenantIds = ticketTenantId ? [new Types.ObjectId(ticketTenantId)] : record.tenantIds ?? [];
  const since = new Date(Date.now() - 365 * 86_400_000);
  const others = (await Visit.distinct('provider', { tenantId: { $in: tenantIds }, date: { $gte: since } }))
    .map(String)
    .filter((id) => !actual.includes(id));
  const ids = [...actual, ...shuffle(others).slice(0, Math.max(0, MAX_DOCTORS - actual.length))];

  const users = await User.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
    .select('name')
    .lean<{ _id: Types.ObjectId; name?: string }[]>();
  return shuffle(users.filter((u) => u.name).map((u) => ({ id: String(u._id), name: u.name as string })));
}

