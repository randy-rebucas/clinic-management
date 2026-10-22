import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount, { type IEmcrDependent } from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { adulthoodDate, isMinor, personRecordIds, type FamilyAccess, type FamilyMember } from '@/lib/patient-family';
import type { PatientSessionPayload } from '@/app/lib/dal';
import { normalizePhone } from '@/lib/phone';

/**
 * eMCR accounts (models/EmcrAccount.ts): one verified phone number holding the person's own
 * clinic records and the records they manage.
 *
 * Sessions: an eMCR sign-in is still a patient token, with `acc` naming the account. Its subject
 * (`patientId`) is the holder's own record, or for a guardian-only account one of the managed
 * records with `rel: 'guardian'` (app/lib/patient-auth.ts then refuses credential actions on it).
 */

const CACHE_TTL_MS = 30 * 1000;

export type EmcrAccountLean = {
  _id: Types.ObjectId;
  phone?: string;
  selfPatientId?: Types.ObjectId;
  dependents?: IEmcrDependent[];
  activation?: { plan?: 'basic' | 'plus'; activatedAt?: Date; expiresAt?: Date; remindersSent?: string[] };
  disabled?: boolean;
};

function toObjectId(value: unknown): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

/**
 * Whether an account-held dependent link is still in force: staff-approved links always, links
 * made by phone + birth date only while the dependent is a minor (as `Patient.guardians`).
 */
export function accountDependentActive(
  dependent: Pick<IEmcrDependent, 'source'>,
  dateOfBirth: unknown,
  now = new Date()
): boolean {
  return dependent.source === 'clinic' || isMinor(dateOfBirth, now);
}

/** The account's dependent links still in force, with each dependent's person record ids. */
export async function activeAccountDependents(
  account: Pick<EmcrAccountLean, 'dependents'>,
  now = new Date()
): Promise<{ link: IEmcrDependent; recordIds: Types.ObjectId[] }[]> {
  const links = account.dependents ?? [];
  if (!links.length) return [];
  await connectDB();
  const records = await Patient.find({ _id: { $in: links.map((d) => d.patientId) }, active: { $ne: false } })
    .select('dateOfBirth')
    .lean<{ _id: Types.ObjectId; dateOfBirth?: Date }[]>();
  const dob = new Map(records.map((r) => [String(r._id), r.dateOfBirth]));
  const active = links.filter((d) => dob.has(String(d.patientId)) && accountDependentActive(d, dob.get(String(d.patientId)), now));
  return Promise.all(active.map(async (link) => ({ link, recordIds: await personRecordIds(link.patientId) })));
}

const managesCache = new Map<string, { access: FamilyAccess | null; expires: number }>();

/**
 * Whether the account manages the person whose record is `patientId` through its own
 * `dependents` list (guardian-only accounts). Links on `Patient.guardians` are checked by
 * canActFor instead. Cached briefly, like canActFor.
 */
export async function accountManages(accountId: string, patientId: string): Promise<boolean> {
  return (await accountAccess(accountId, patientId)) !== null;
}

/**
 * accountManages with the link's clinic scope (as familyAccess): a staff-approved link opens
 * only the approving clinic's records, a phone + birth date link opens all of them.
 */
export async function accountAccess(accountId: string, patientId: string): Promise<FamilyAccess | null> {
  if (!Types.ObjectId.isValid(accountId) || !Types.ObjectId.isValid(patientId)) return null;
  const key = `${accountId}:${patientId}`;
  const cached = managesCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.access;

  await connectDB();
  const account = await EmcrAccount.findById(accountId).select('dependents disabled').lean<EmcrAccountLean | null>();
  let access: FamilyAccess | null = null;
  if (account && !account.disabled && account.dependents?.length) {
    for (const d of await activeAccountDependents(account)) {
      if (!d.recordIds.some((id) => String(id) === patientId)) continue;
      const scope = dependentLinkScope(d.link);
      if (!scope.tid) {
        access = {};
        break;
      }
      access = access ?? scope;
    }
  }
  managesCache.set(key, { access, expires: Date.now() + CACHE_TTL_MS });
  if (managesCache.size > 5000) {
    const now = Date.now();
    for (const [k, entry] of managesCache) if (entry.expires < now) managesCache.delete(k);
  }
  return access;
}

/** The clinic scope a dependent link grants: staff links stay at their clinic. */
function dependentLinkScope(link: Pick<IEmcrDependent, 'source' | 'tenantId'>): FamilyAccess {
  return link.source === 'clinic' && link.tenantId ? { tid: String(link.tenantId) } : {};
}

/** Drop cached decisions after an account's links change. */
export function forgetAccountCache(): void {
  managesCache.clear();
}

/**
 * The eMCR account behind a patient session: the one named by `acc`, else (password or QR
 * sign-ins) the account whose holder is the signed-in person. Null when there is none yet.
 */
export async function findAccountForSession(
  session: Pick<PatientSessionPayload, 'acc' | 'patientId' | 'guardianId'>
): Promise<EmcrAccountLean | null> {
  await connectDB();
  if (session.acc && Types.ObjectId.isValid(session.acc)) {
    return EmcrAccount.findById(session.acc).lean<EmcrAccountLean | null>();
  }
  const holder = session.guardianId ?? session.patientId;
  const ids = await personRecordIds(holder);
  if (!ids.length) return null;
  return EmcrAccount.findOne({ selfPatientId: { $in: ids } }).lean<EmcrAccountLean | null>();
}

/**
 * The account for a session, created for the signed-in person when they have none yet (a
 * patient who only ever signed in with a password or a QR). Never creates one for a guardian
 * session: those always carry `acc`.
 */
export async function ensureAccountForSession(
  session: Pick<PatientSessionPayload, 'acc' | 'patientId' | 'guardianId' | 'rel'>
): Promise<EmcrAccountLean | null> {
  const found = await findAccountForSession(session);
  if (found || session.acc || session.rel === 'guardian') return found;
  const holder = toObjectId(session.guardianId ?? session.patientId);
  try {
    const created = await EmcrAccount.create({ selfPatientId: holder });
    return created.toObject() as EmcrAccountLean;
  } catch (error: any) {
    // Another request created it first (unique selfPatientId).
    if (error?.code === 11000) return EmcrAccount.findOne({ selfPatientId: holder }).lean<EmcrAccountLean | null>();
    throw error;
  }
}

/**
 * Accounts that manage `patientId` through `dependents`, as the record ids their devices sign in
 * with (holder's records, or the managed records for a guardian-only account). For pushes.
 */
export async function accountManagerRecordIds(
  patientId: string,
  tenantId?: string | Types.ObjectId | null
): Promise<Types.ObjectId[]> {
  await connectDB();
  const ids = await personRecordIds(patientId);
  if (!ids.length) return [];
  const accounts = await EmcrAccount.find({ 'dependents.patientId': { $in: ids }, disabled: { $ne: true } })
    .select('selfPatientId dependents')
    .limit(20)
    .lean<EmcrAccountLean[]>();
  const out = new Map<string, Types.ObjectId>();
  for (const account of accounts) {
    const dependents = await activeAccountDependents(account);
    // A staff-approved link only hears about its own clinic.
    const manages = dependents.some((d) => {
      const scope = dependentLinkScope(d.link);
      return (!scope.tid || (!!tenantId && scope.tid === String(tenantId))) && d.recordIds.some((id) => ids.some((own) => String(own) === String(id)));
    });
    if (!manages) continue;
    if (account.selfPatientId) for (const id of await personRecordIds(account.selfPatientId)) out.set(String(id), id);
    for (const d of dependents) for (const id of d.recordIds) out.set(String(id), id);
  }
  for (const own of ids) out.delete(String(own));
  return [...out.values()];
}

/**
 * Attach `selfPatientId` to `accountId`. When another account already holds that person (made
 * from a password sign-in, without a phone), it is folded into this one: its activation and
 * dependents move over, so a voucher redeemed before the first phone sign-in is kept.
 */
export async function attachSelf(accountId: Types.ObjectId, selfPatientId: Types.ObjectId): Promise<void> {
  await connectDB();
  const ids = await personRecordIds(selfPatientId);
  const other = await EmcrAccount.findOne({ _id: { $ne: accountId }, selfPatientId: { $in: ids } }).lean<
    (EmcrAccountLean & { activationHistory?: unknown[] }) | null
  >();
  if (other) {
    const self = await EmcrAccount.findById(accountId).lean<EmcrAccountLean | null>();
    const keepOther =
      !!other.activation?.expiresAt &&
      (!self?.activation?.expiresAt || new Date(other.activation.expiresAt) > new Date(self.activation.expiresAt));
    await EmcrAccount.deleteOne({ _id: other._id });
    await EmcrAccount.updateOne(
      { _id: accountId },
      {
        $set: { selfPatientId, ...(keepOther ? { activation: other.activation } : {}) },
        $push: {
          dependents: { $each: other.dependents ?? [] },
          activationHistory: { $each: (other.activationHistory as any[]) ?? [] },
        },
      }
    );
  } else {
    await EmcrAccount.updateOne({ _id: accountId }, { $set: { selfPatientId } });
  }
  forgetAccountCache();
}

/**
 * The account's own dependents (guardian-only accounts), in the shape of the family list
 * (`FamilyMember`), so the app shows them the same way as `Patient.guardians` links.
 */
export async function listAccountDependents(account: Pick<EmcrAccountLean, 'dependents'>, now = new Date()): Promise<FamilyMember[]> {
  const active = await activeAccountDependents(account, now);
  if (!active.length) return [];
  const records = await Patient.find({ _id: { $in: active.flatMap((d) => d.recordIds) }, active: { $ne: false } })
    .select('firstName lastName dateOfBirth sex tenantIds')
    .lean<{ _id: Types.ObjectId; firstName: string; lastName: string; dateOfBirth?: Date; sex?: string; tenantIds?: unknown[] }[]>();
  const tenantIds = [...new Set(records.flatMap((r) => (r.tenantIds ?? []).map(String)))].filter((id) => Types.ObjectId.isValid(id));
  const tenants = tenantIds.length
    ? await Tenant.find({ _id: { $in: tenantIds.map((id) => new Types.ObjectId(id)) } })
        .select('name displayName')
        .lean<{ _id: Types.ObjectId; name?: string; displayName?: string }[]>()
    : [];
  const names = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || 'Clinic']));

  return active.flatMap(({ link, recordIds }) => {
    const mine = records.filter((r) => recordIds.some((id) => String(id) === String(r._id)));
    const main = mine.find((r) => String(r._id) === String(link.patientId)) ?? mine[0];
    if (!main) return [];
    const adult = adulthoodDate(main.dateOfBirth);
    const source: FamilyMember['source'] = link.source === 'clinic' ? 'clinic' : 'phone';
    return [
      {
        id: String(main._id),
        firstName: main.firstName,
        lastName: main.lastName,
        dateOfBirth: main.dateOfBirth ? new Date(main.dateOfBirth).toISOString().slice(0, 10) : null,
        sex: main.sex ?? null,
        relationship: link.relationship ?? null,
        source,
        accessEndsAt: source === 'phone' && adult ? adult.toISOString().slice(0, 10) : null,
        clinics: [...new Set(mine.flatMap((r) => (r.tenantIds ?? []).map(String)))].map((id) => names.get(id)).filter((n): n is string => !!n),
      },
    ];
  });
}

/**
 * Who a fresh eMCR session signs in as: the holder's own record, else (guardian-only) the first
 * record they manage. Null when the account has no usable profile yet.
 */
export async function accountSessionSubject(
  account: EmcrAccountLean
): Promise<{ patient: any; rel?: 'guardian' } | null> {
  await connectDB();
  const fields = 'patientCode firstName lastName email sessionVersion active';
  if (account.selfPatientId) {
    const self = await Patient.findById(account.selfPatientId).select(`${fields} phone`);
    // Only while the record still carries the account's number: after the clinic changes it (new
    // SIM, typo fixed), whoever holds the old number must not keep signing in as this person.
    const samePhone = !!self?.phone && !!account.phone && normalizePhone(self.phone) === normalizePhone(account.phone);
    if (self && self.active !== false && samePhone) return { patient: self };
  }
  for (const { link } of await activeAccountDependents(account)) {
    const record = await Patient.findById(link.patientId).select(fields);
    if (record && record.active !== false) return { patient: record, rel: 'guardian' };
  }
  return null;
}
