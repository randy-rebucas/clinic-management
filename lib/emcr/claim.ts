import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import Patient from '@/models/Patient';
import { normalizePhone } from '@/lib/phone';
import { phoneVariants } from '@/app/api/patients/auth/shared';
import { linkRecordsByVerifiedPhone } from '@/app/api/patients/me/_lib/linked-records';
import { FAMILY_RELATIONSHIPS, isMinor, personRecordIds } from '@/lib/patient-family';
import { attachSelf, forgetAccountCache, type EmcrAccountLean } from '@/lib/emcr/account';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';

/**
 * Claiming clinic records for an eMCR account, after the caller proved their phone by OTP:
 * "Is this your record?" → first name + date of birth.
 *
 * - `self`: the record's own phone must be the verified number. It becomes the holder's record.
 * - `other`, the person is a minor: managed by the holder (lapses at 18), as the existing family
 *   rules: on the child's records (`Patient.guardians`) when the holder has a record, else on
 *   the account (`dependents`).
 * - `other`, the person is an adult: never on a birth date alone. A request goes to the clinic,
 *   whose staff confirm consent in person.
 *
 * Matching never lists names back to the caller; it only says matched / not matched.
 */

/** 15 minutes to answer the questions after the OTP. */
const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;
const CLAIM_PURPOSE = 'emcr-claim';
const MAX_CANDIDATES = 50;

export type ClaimRelation = 'self' | 'other';

export type ClaimResult =
  | { status: 'linked'; relation: ClaimRelation; patientId: string }
  | { status: 'already_linked'; relation: ClaimRelation; patientId: string }
  | { status: 'pending_approval'; clinics: number }
  | { status: 'no_match' }
  | { status: 'ambiguous' }
  | { status: 'self_taken' };

/** Proof, for the claim step, that the caller verified `phone` for `accountId`. */
export function issueClaimToken(accountId: string, phoneE164: string): { token: string; expiresAt: Date } {
  return createSignedLinkToken(CLAIM_PURPOSE, [accountId, phoneE164], CLAIM_TOKEN_TTL_MS);
}

export function readClaimToken(token: unknown): { accountId: string; phone: string } | null {
  if (typeof token !== 'string' || !token) return null;
  const parts = readSignedLinkToken(CLAIM_PURPOSE, token, 2);
  if (!parts || !Types.ObjectId.isValid(parts[0])) return null;
  return { accountId: parts[0], phone: parts[1] };
}

/** Lowercase, no accents, single spaces: "  José  Mari " → "jose mari". */
export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The typed first name matches the record's: the whole first name, or its first word
 * ("Maria" for "Maria Clara"). Nicknames don't match.
 */
export function firstNameMatches(typed: unknown, stored: unknown): boolean {
  const t = normalizeName(typed);
  const s = normalizeName(stored);
  if (!t || !s) return false;
  return t === s || t === s.split(' ')[0];
}

/** "YYYY-MM-DD" of a date (UTC, as birth dates are stored), or null. */
export function birthDay(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value as string | Date);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

type CandidateRecord = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  phone?: string;
  accountId?: Types.ObjectId;
  tenantIds?: Types.ObjectId[];
  guardians?: { patient: Types.ObjectId; source: string }[];
};

/**
 * The records on this phone number that match the answers, grouped by person (one person can
 * have a record at several clinics). More than one person means the answers can't tell them
 * apart.
 */
export function groupMatches(records: CandidateRecord[], firstName: string, dob: string): CandidateRecord[][] {
  const matches = records.filter((r) => birthDay(r.dateOfBirth) === dob && firstNameMatches(firstName, r.firstName));
  const groups = new Map<string, CandidateRecord[]>();
  for (const r of matches) {
    const key = `${normalizeName(r.firstName)}|${normalizeName(r.lastName)}|${dob}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()];
}

async function recordsOnPhone(phone: string): Promise<CandidateRecord[]> {
  const variants = phoneVariants(phone);
  return Patient.find({
    $or: [{ phone: { $in: variants } }, { 'contacts.phone': { $in: variants } }],
    active: { $ne: false },
    selfRegistered: { $ne: true },
  })
    .select('firstName lastName dateOfBirth phone accountId tenantIds guardians')
    .limit(MAX_CANDIDATES)
    .lean<CandidateRecord[]>();
}

/** How many people (not records) have this number on file, for "We found N records". */
export async function countPeopleOnPhone(phone: string): Promise<number> {
  await connectDB();
  const records = await recordsOnPhone(phone);
  return new Set(records.map((r) => `${normalizeName(r.firstName)}|${normalizeName(r.lastName)}|${birthDay(r.dateOfBirth)}`)).size;
}

export async function claimProfile(options: {
  accountId: string;
  phone: string;
  relation: ClaimRelation;
  firstName: string;
  dateOfBirth: string;
  relationship?: string;
  now?: Date;
}): Promise<ClaimResult> {
  const now = options.now ?? new Date();
  await connectDB();
  const account = await EmcrAccount.findById(options.accountId).lean<EmcrAccountLean | null>();
  if (!account || account.disabled) return { status: 'no_match' };

  const dob = birthDay(options.dateOfBirth);
  if (!dob) return { status: 'no_match' };
  const groups = groupMatches(await recordsOnPhone(options.phone), options.firstName, dob);
  if (!groups.length) return { status: 'no_match' };
  if (groups.length > 1) return { status: 'ambiguous' };
  const person = groups[0];

  const proven = normalizePhone(options.phone);
  if (options.relation === 'self') {
    // Your own record carries your number as its own phone, not as an emergency contact.
    const own = person.find((r) => r.phone && normalizePhone(r.phone) === proven);
    if (!own) return { status: 'no_match' };
    const ids = await personRecordIds(own._id);
    if (account.selfPatientId) {
      if (ids.some((id) => String(id) === String(account.selfPatientId))) {
        return { status: 'already_linked', relation: 'self', patientId: String(account.selfPatientId) };
      }
      return { status: 'self_taken' };
    }
    await linkRecordsByVerifiedPhone(String(own._id), options.phone);
    await attachSelf(account._id, own._id);
    return { status: 'linked', relation: 'self', patientId: String(own._id) };
  }

  const target = person[0];
  const relationship = FAMILY_RELATIONSHIPS.includes(options.relationship as any) ? options.relationship : 'other';
  const targetIds = await personRecordIds(target._id);
  if (account.selfPatientId && targetIds.some((id) => String(id) === String(account.selfPatientId))) {
    return { status: 'no_match' };
  }

  if (!isMinor(target.dateOfBirth, now)) {
    return requestAdultProfile(account, person, relationship!, options.firstName, dob);
  }

  // One person, possibly at several clinics: link their records so the profile shows all.
  const personIds = person.map((r) => r._id);
  const accountGroups = [...new Set(person.map((r) => r.accountId).filter(Boolean).map(String))].map((id) => new Types.ObjectId(id));
  if (personIds.length > 1 || accountGroups.length > 1) {
    const accountId = accountGroups[0] ?? personIds[0];
    await Patient.updateMany(
      accountGroups.length ? { $or: [{ _id: { $in: personIds } }, { accountId: { $in: accountGroups } }] } : { _id: { $in: personIds } },
      { $set: { accountId } }
    );
  }

  if (account.selfPatientId) {
    const holderIds = new Set((await personRecordIds(account.selfPatientId)).map(String));
    const fresh = person.filter((r) => !(r.guardians ?? []).some((g) => holderIds.has(String(g.patient))));
    if (!fresh.length) return { status: 'already_linked', relation: 'other', patientId: String(target._id) };
    await Patient.updateMany(
      { _id: { $in: fresh.map((r) => r._id) } },
      { $push: { guardians: { patient: account.selfPatientId, relationship, source: 'phone', addedAt: now } } }
    );
    // canActFor caches decisions for 30 s; new links only add access, so stale "no" answers
    // just make the first switch to the profile wait briefly.
    return { status: 'linked', relation: 'other', patientId: String(target._id) };
  }

  const already = (account.dependents ?? []).some((d) => targetIds.some((id) => String(id) === String(d.patientId)));
  if (already) return { status: 'already_linked', relation: 'other', patientId: String(target._id) };
  await EmcrAccount.updateOne(
    { _id: account._id },
    { $push: { dependents: { patientId: target._id, relationship, source: 'phone_dob', addedAt: now } } }
  );
  forgetAccountCache();
  return { status: 'linked', relation: 'other', patientId: String(target._id) };
}

/** One pending request per clinic that has the adult's record; any of them may approve. */
async function requestAdultProfile(
  account: EmcrAccountLean,
  person: CandidateRecord[],
  relationship: string,
  firstName: string,
  dob: string
): Promise<ClaimResult> {
  const byClinic = new Map<string, CandidateRecord>();
  for (const r of person) for (const t of r.tenantIds ?? []) if (!byClinic.has(String(t))) byClinic.set(String(t), r);
  for (const [tenantId, record] of byClinic) {
    await EmcrAccessRequest.updateOne(
      { kind: 'adult_profile', tenantId: new Types.ObjectId(tenantId), accountId: account._id, patientId: record._id, status: 'pending' },
      {
        $setOnInsert: {
          kind: 'adult_profile',
          tenantId: new Types.ObjectId(tenantId),
          accountId: account._id,
          patientId: record._id,
          status: 'pending',
          firstName,
          dateOfBirth: new Date(`${dob}T00:00:00Z`),
          contactPhone: account.phone,
        },
        $set: { relationship },
      },
      { upsert: true }
    );
  }
  return { status: 'pending_approval', clinics: byClinic.size };
}
