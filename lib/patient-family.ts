import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { normalizePhone } from '@/lib/phone';
import { phoneVariants } from '@/app/api/patients/auth/shared';
import { linkedRecords } from '@/app/api/patients/me/_lib/linked-records';

/**
 * Family accounts: one app login manages other people's records (a parent and their children,
 * an adult child and an elderly parent). The dependent's record lists the guardian under
 * `guardians`; the app then sends `X-Patient-Profile: <dependent id>` and every patient route
 * answers for the dependent (app/lib/patient-auth.ts).
 *
 * Two ways in, chosen so nobody gains access to another adult's records on their own say-so:
 * - `phone`: the guardian proves their phone by OTP and adds a minor whose clinic record carries
 *   that same phone number. Lapses automatically when the dependent turns 18.
 * - `clinic`: staff link the two records at the front desk, after checking consent in person.
 *   Needed for adults (elderly parents) and for children registered under another number.
 */

export const ADULT_AGE = 18;
const MAX_DEPENDENTS = 20;
const CACHE_TTL_MS = 30 * 1000;

export const FAMILY_RELATIONSHIPS = ['child', 'parent', 'spouse', 'sibling', 'grandparent', 'grandchild', 'other'] as const;

export type GuardianEntry = {
  patient: Types.ObjectId;
  relationship?: string;
  source: 'phone' | 'clinic';
  tenantId?: Types.ObjectId;
  addedAt?: Date;
};

export type FamilyMember = {
  /** The dependent's record id: what the app sends as `X-Patient-Profile`. */
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  relationship: string | null;
  source: 'phone' | 'clinic';
  /** For `phone` links: when access lapses (the 18th birthday). */
  accessEndsAt: string | null;
  clinics: string[];
};

export type FamilySuggestion = {
  /** Opaque; send back to POST /api/patients/me/family. */
  key: string;
  firstName: string;
  lastInitial: string;
  birthYear: number | null;
  clinics: string[];
};

function toObjectId(value: unknown): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

/** The day this person turns `ADULT_AGE`, or null without a usable birth date. */
export function adulthoodDate(dateOfBirth: unknown): Date | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth as string | Date);
  if (isNaN(dob.getTime())) return null;
  return new Date(Date.UTC(dob.getUTCFullYear() + ADULT_AGE, dob.getUTCMonth(), dob.getUTCDate()));
}

export function isMinor(dateOfBirth: unknown, now = new Date()): boolean {
  const adult = adulthoodDate(dateOfBirth);
  return adult !== null && now < adult;
}

/** A guardianship still grants access: staff links always, phone links only while a minor. */
export function guardianshipActive(entry: Pick<GuardianEntry, 'source'>, dependentDob: unknown, now = new Date()): boolean {
  return entry.source === 'clinic' || (entry.source === 'phone' && isMinor(dependentDob, now));
}

type PersonRecord = {
  _id: Types.ObjectId;
  accountId?: Types.ObjectId;
  tenantIds?: Types.ObjectId[];
  dateOfBirth?: Date;
  active?: boolean;
  guardians?: GuardianEntry[];
};

/** Every record id of the person `patientId` belongs to (their own plus phone-linked ones). */
export async function personRecordIds(patientId: unknown): Promise<Types.ObjectId[]> {
  await connectDB();
  const patient = await Patient.findById(toObjectId(patientId)).select('accountId tenantIds').lean<PersonRecord | null>();
  if (!patient) return [];
  return (await linkedRecords(patient)).patientIds;
}

const actCache = new Map<string, { ok: boolean; expires: number }>();

/**
 * Whether the person signed in as `guardianId` may act for the person whose record is
 * `dependentId`. Checked on every request that carries `X-Patient-Profile`; cached briefly, like
 * session revocation, so unlinking takes effect within seconds.
 */
export async function canActFor(guardianId: string, dependentId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(guardianId) || !Types.ObjectId.isValid(dependentId)) return false;
  const key = `${guardianId}:${dependentId}`;
  const cached = actCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.ok;

  const ok = await checkActFor(guardianId, dependentId);
  actCache.set(key, { ok, expires: Date.now() + CACHE_TTL_MS });
  if (actCache.size > 5000) {
    const now = Date.now();
    for (const [k, entry] of actCache) if (entry.expires < now) actCache.delete(k);
  }
  return ok;
}

/** Drop cached decisions after a link changes, so this instance applies it at once. */
function forgetActCache(): void {
  actCache.clear();
}

async function checkActFor(guardianId: string, dependentId: string): Promise<boolean> {
  await connectDB();
  const guardianIds = await personRecordIds(guardianId);
  if (!guardianIds.length || guardianIds.some((id) => String(id) === dependentId)) return false;

  const dependent = await Patient.findById(dependentId)
    .select('accountId dateOfBirth active guardians')
    .lean<PersonRecord | null>();
  if (!dependent || dependent.active === false) return false;

  // The link may sit on any of the dependent's own records (one per clinic).
  const records: PersonRecord[] = dependent.accountId
    ? await Patient.find({ accountId: dependent.accountId, active: { $ne: false } })
        .select('dateOfBirth guardians')
        .limit(MAX_DEPENDENTS)
        .lean<PersonRecord[]>()
    : [dependent];

  const guardianKeys = new Set(guardianIds.map(String));
  return records.some((record) =>
    (record.guardians ?? []).some(
      (g) => guardianKeys.has(String(g.patient)) && guardianshipActive(g, record.dateOfBirth ?? dependent.dateOfBirth)
    )
  );
}

async function clinicNames(tenantIds: unknown[]): Promise<Map<string, string>> {
  const ids = [...new Set(tenantIds.map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (!ids.length) return new Map();
  const tenants = await Tenant.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
    .select('name displayName')
    .lean<{ _id: Types.ObjectId; name?: string; displayName?: string }[]>();
  return new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || 'Clinic']));
}

type DependentRecord = PersonRecord & { firstName: string; lastName: string; sex?: string };

/**
 * The people this guardian manages, one entry per person (records of one person at several
 * clinics are folded together). Lapsed phone links are left out.
 */
export async function listDependents(guardianIds: Types.ObjectId[], now = new Date()): Promise<FamilyMember[]> {
  if (!guardianIds.length) return [];
  await connectDB();
  const guardianKeys = new Set(guardianIds.map(String));

  const records = await Patient.find({
    'guardians.patient': { $in: guardianIds },
    _id: { $nin: guardianIds },
    active: { $ne: false },
  })
    .select('firstName lastName dateOfBirth sex accountId tenantIds guardians')
    .limit(MAX_DEPENDENTS * 3)
    .lean<DependentRecord[]>();

  const people = new Map<string, { record: DependentRecord; entry: GuardianEntry; tenantIds: unknown[] }>();
  for (const record of records) {
    const entry = (record.guardians ?? []).find(
      (g) => guardianKeys.has(String(g.patient)) && guardianshipActive(g, record.dateOfBirth, now)
    );
    if (!entry) continue;
    const personKey = String(record.accountId ?? record._id);
    const existing = people.get(personKey);
    if (existing) {
      existing.tenantIds.push(...(record.tenantIds ?? []));
      // A staff link outlives a phone link; show the stronger one.
      if (existing.entry.source === 'phone' && entry.source === 'clinic') existing.entry = entry;
    } else {
      people.set(personKey, { record, entry, tenantIds: [...(record.tenantIds ?? [])] });
    }
  }

  const names = await clinicNames([...people.values()].flatMap((p) => p.tenantIds));
  return [...people.values()]
    .slice(0, MAX_DEPENDENTS)
    .map(({ record, entry, tenantIds }) => {
      const adult = adulthoodDate(record.dateOfBirth);
      return {
        id: String(record._id),
        firstName: record.firstName,
        lastName: record.lastName,
        dateOfBirth: record.dateOfBirth ? new Date(record.dateOfBirth).toISOString().slice(0, 10) : null,
        sex: record.sex ?? null,
        relationship: entry.relationship ?? null,
        source: entry.source,
        accessEndsAt: entry.source === 'phone' && adult ? adult.toISOString().slice(0, 10) : null,
        clinics: [...new Set(tenantIds.map(String))].map((id) => names.get(id)).filter((n): n is string => !!n),
      };
    })
    .sort((a, b) => (a.dateOfBirth ?? '').localeCompare(b.dateOfBirth ?? ''));
}

function suggestionKey(record: { firstName: string; dateOfBirth?: Date }): string | null {
  if (!record.dateOfBirth) return null;
  const day = new Date(record.dateOfBirth).toISOString().slice(0, 10);
  return Buffer.from(`${day}|${record.firstName.trim().toLowerCase()}`).toString('base64url');
}

type GuardianSelf = { _id: Types.ObjectId; phone?: string; dateOfBirth?: Date };

/**
 * Minors registered at any clinic with this guardian's own phone number, not yet in the family.
 * Records of one child at several clinics (same first name and birth date) come back as one
 * suggestion. Only first name, last initial and birth year are shown before the guardian adds them.
 */
async function phoneMinorRecords(guardian: GuardianSelf, guardianIds: Types.ObjectId[], now: Date) {
  if (!guardian.phone || !normalizePhone(guardian.phone)) return [];
  const candidates = await Patient.find({
    _id: { $nin: guardianIds },
    phone: { $in: phoneVariants(guardian.phone) },
    active: { $ne: false },
    selfRegistered: { $ne: true },
  })
    .select('firstName lastName dateOfBirth accountId tenantIds guardians')
    .limit(MAX_DEPENDENTS * 3)
    .lean<DependentRecord[]>();
  return candidates.filter((c) => isMinor(c.dateOfBirth, now));
}

export async function findFamilySuggestions(guardianId: string, now = new Date()): Promise<FamilySuggestion[]> {
  await connectDB();
  const guardian = await Patient.findById(guardianId).select('phone dateOfBirth accountId tenantIds').lean<GuardianSelf & PersonRecord | null>();
  if (!guardian) return [];
  const guardianIds = (await linkedRecords(guardian)).patientIds;
  const guardianKeys = new Set(guardianIds.map(String));

  const groups = new Map<string, { record: DependentRecord; tenantIds: unknown[]; linked: boolean }>();
  for (const record of await phoneMinorRecords(guardian, guardianIds, now)) {
    const key = suggestionKey(record);
    if (!key) continue;
    const linked = (record.guardians ?? []).some((g) => guardianKeys.has(String(g.patient)));
    const group = groups.get(key);
    if (group) {
      group.tenantIds.push(...(record.tenantIds ?? []));
      group.linked = group.linked && linked;
    } else {
      groups.set(key, { record, tenantIds: [...(record.tenantIds ?? [])], linked });
    }
  }

  const open = [...groups.entries()].filter(([, g]) => !g.linked);
  const names = await clinicNames(open.flatMap(([, g]) => g.tenantIds));
  return open.map(([key, { record, tenantIds }]) => ({
    key,
    firstName: record.firstName,
    lastInitial: record.lastName ? `${record.lastName.trim()[0]?.toUpperCase() ?? ''}.` : '',
    birthYear: record.dateOfBirth ? new Date(record.dateOfBirth).getUTCFullYear() : null,
    clinics: [...new Set(tenantIds.map(String))].map((id) => names.get(id)).filter((n): n is string => !!n),
  }));
}

/**
 * Add the minor behind suggestion `key` to this guardian's family: every record of that child
 * that carries the guardian's phone gets a `phone` guardianship, and the records are linked into
 * one person (shared `accountId`) so the child's profile shows every clinic.
 * Returns the dependent's record id, or null when the key no longer matches anyone.
 */
export async function addPhoneDependent(
  guardianId: string,
  key: string,
  relationship: string | undefined,
  now = new Date()
): Promise<string | null> {
  await connectDB();
  const guardian = await Patient.findById(guardianId).select('phone dateOfBirth accountId tenantIds').lean<GuardianSelf & PersonRecord | null>();
  if (!guardian) return null;
  const guardianIds = (await linkedRecords(guardian)).patientIds;
  const guardianKeys = new Set(guardianIds.map(String));

  const members = (await phoneMinorRecords(guardian, guardianIds, now)).filter((r) => suggestionKey(r) === key);
  if (!members.length) return null;

  const memberIds = members.map((m) => m._id);
  const groups = [...new Set(members.map((m) => m.accountId).filter(Boolean).map(String))].map((id) => new Types.ObjectId(id));
  if (members.length > 1 || groups.length > 1) {
    const accountId = groups[0] ?? memberIds[0];
    await Patient.updateMany(
      groups.length ? { $or: [{ _id: { $in: memberIds } }, { accountId: { $in: groups } }] } : { _id: { $in: memberIds } },
      { $set: { accountId } }
    );
  }

  const fresh = memberIds.filter((id) => {
    const record = members.find((m) => String(m._id) === String(id));
    return !(record?.guardians ?? []).some((g) => guardianKeys.has(String(g.patient)));
  });
  if (fresh.length) {
    await Patient.updateMany(
      { _id: { $in: fresh } },
      {
        $push: {
          guardians: {
            patient: toObjectId(guardianId),
            relationship: relationship || 'child',
            source: 'phone',
            addedAt: now,
          },
        },
      }
    );
  }
  forgetActCache();
  return String(memberIds[0]);
}

/**
 * Remove this guardian (any of their records) from every record of the dependent's person.
 * Returns false when the guardian had no link to that person.
 */
export async function removeDependent(guardianIds: Types.ObjectId[], dependentId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(dependentId)) return false;
  await connectDB();
  const dependentIds = await personRecordIds(dependentId);
  if (!dependentIds.length) return false;
  const result = await Patient.updateMany(
    { _id: { $in: dependentIds }, 'guardians.patient': { $in: guardianIds } },
    { $pull: { guardians: { patient: { $in: guardianIds } } } }
  );
  forgetActCache();
  return result.modifiedCount > 0;
}

/**
 * Staff link: `guardianId` may manage `dependentId` (both registered at `tenantId`).
 * Replaces an earlier link between the two, keeping one entry per guardian record.
 */
export async function addClinicGuardian(options: {
  dependentId: Types.ObjectId;
  guardianId: Types.ObjectId;
  tenantId: Types.ObjectId;
  relationship?: string;
  addedBy?: string;
}): Promise<void> {
  await connectDB();
  await Patient.updateOne({ _id: options.dependentId }, { $pull: { guardians: { patient: options.guardianId } } });
  await Patient.updateOne(
    { _id: options.dependentId },
    {
      $push: {
        guardians: {
          patient: options.guardianId,
          relationship: options.relationship,
          source: 'clinic',
          tenantId: options.tenantId,
          addedBy: options.addedBy && Types.ObjectId.isValid(options.addedBy) ? new Types.ObjectId(options.addedBy) : undefined,
          addedAt: new Date(),
        },
      },
    }
  );
  forgetActCache();
}

/**
 * Record ids whose app devices should also hear about `dependentId` (its active guardians, on
 * every record they sign in with). Empty when nobody manages this record.
 */
export async function guardianRecordIds(dependentId: unknown, now = new Date()): Promise<Types.ObjectId[]> {
  await connectDB();
  const dependent = await Patient.findById(toObjectId(dependentId))
    .select('accountId dateOfBirth guardians')
    .lean<PersonRecord | null>();
  if (!dependent) return [];
  const records: PersonRecord[] = dependent.accountId
    ? await Patient.find({ accountId: dependent.accountId, active: { $ne: false } })
        .select('dateOfBirth guardians')
        .limit(MAX_DEPENDENTS)
        .lean<PersonRecord[]>()
    : [dependent];

  const direct = records.flatMap((r) =>
    (r.guardians ?? []).filter((g) => guardianshipActive(g, r.dateOfBirth ?? dependent.dateOfBirth, now)).map((g) => g.patient)
  );
  if (!direct.length) return [];

  const guardians = await Patient.find({ _id: { $in: direct }, active: { $ne: false } })
    .select('accountId')
    .lean<{ _id: Types.ObjectId; accountId?: Types.ObjectId }[]>();
  const accountIds = guardians.map((g) => g.accountId).filter(Boolean);
  const linked = accountIds.length
    ? await Patient.find({ accountId: { $in: accountIds }, active: { $ne: false } }).select('_id').limit(100).lean<{ _id: Types.ObjectId }[]>()
    : [];
  const ids = new Map<string, Types.ObjectId>();
  for (const g of guardians) ids.set(String(g._id), g._id);
  for (const r of linked) ids.set(String(r._id), r._id);
  return [...ids.values()];
}
