import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { personRecordIds } from '@/lib/patient-family';

/**
 * Structured eMCR login IDs: `<location>.<initials>.<YYYYMMDD>@myclinicsoft.solutions`, e.g.
 * `qc01.jdc.19900425@myclinicsoft.solutions` for Juan Dela Cruz, born 25 April 1990, first seen at
 * the clinic whose location code is QC01. A second person with the same parts gets `.2`, `.3`…
 *
 * A sign-in name only (with the account's password, like the mobile number): no mailbox exists
 * and nothing is ever sent to it. Assigned once, when the account first gets a password, and then
 * kept: a clinic changing its location code later doesn't rename anyone.
 */

export const LOGIN_ID_DOMAIN = (process.env.EMCR_LOGIN_DOMAIN || 'myclinicsoft.solutions').toLowerCase();
const MAX_INITIALS = 4;
const MAX_SUFFIX = 99;

/** First letter of every word of the names, accents removed: "Juan Dela Cruz" → "jdc", "Ma. Clara" → "mc". */
export function patientInitials(firstName?: string, lastName?: string): string {
  const words = `${firstName ?? ''} ${lastName ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, MAX_INITIALS);
}

/** "19900425" from a birth date (UTC, as stored), or null. */
export function birthDigits(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | Date);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** The ID before any tie-breaker, or null when a part is missing. */
export function baseLoginId(locationCode: string | undefined, record: { firstName?: string; lastName?: string; dateOfBirth?: unknown }): string | null {
  const loc = (locationCode ?? '').toLowerCase();
  const initials = patientInitials(record.firstName, record.lastName);
  const born = birthDigits(record.dateOfBirth);
  if (!/^[a-z0-9]{2,6}$/.test(loc) || !initials || !born) return null;
  return `${loc}.${initials}.${born}`;
}

/** The first of `base`, `base.2`, `base.3`… not in `taken`. */
export function nextFreeLoginId(base: string, taken: Iterable<string>): string | null {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n <= MAX_SUFFIX; n++) if (!used.has(`${base}.${n}`)) return `${base}.${n}`;
  return null;
}

/** The local part of a typed login ID (`…@myclinicsoft.solutions`, any case), or null. */
export function parseLoginId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  const suffix = `@${LOGIN_ID_DOMAIN}`;
  if (!value.endsWith(suffix)) return null;
  const local = value.slice(0, -suffix.length);
  return /^[a-z0-9]{2,6}\.[a-z]{1,4}\.\d{8}(\.\d{1,2})?$/.test(local) ? local : null;
}

export function fullLoginId(local: string | undefined | null): string | null {
  return local ? `${local}@${LOGIN_ID_DOMAIN}` : null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Give the account its login ID if it has none yet. Needs the holder's own record (a guardian-only
 * account has no name or birth date of its own and keeps signing in with the mobile number) and a
 * clinic of that person with a location code: `preferTenantId` (e.g. the clinic that issued the
 * invite) first, then the record's clinics. Returns the local part, or null when none can be made.
 */
export async function ensureLoginId(accountId: Types.ObjectId | string, preferTenantId?: Types.ObjectId | string): Promise<string | null> {
  await connectDB();
  const account = await EmcrAccount.findById(accountId)
    .select('loginId selfPatientId')
    .lean<{ _id: Types.ObjectId; loginId?: string; selfPatientId?: Types.ObjectId } | null>();
  if (!account) return null;
  if (account.loginId) return account.loginId;
  if (!account.selfPatientId) return null;

  const ids = await personRecordIds(account.selfPatientId);
  const records = await Patient.find({ _id: { $in: ids } })
    .select('firstName lastName dateOfBirth tenantIds')
    .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string; dateOfBirth?: Date; tenantIds?: Types.ObjectId[] }[]>();
  const self = records.find((r) => String(r._id) === String(account.selfPatientId)) ?? records[0];
  if (!self) return null;

  const order = [
    ...(preferTenantId ? [String(preferTenantId)] : []),
    ...(self.tenantIds ?? []).map(String),
    ...records.flatMap((r) => (r.tenantIds ?? []).map(String)),
  ].filter((id, i, all) => Types.ObjectId.isValid(id) && all.indexOf(id) === i);
  if (!order.length) return null;
  const tenants = await Tenant.find({ _id: { $in: order.map((id) => new Types.ObjectId(id)) }, locationCode: { $type: 'string' } })
    .select('locationCode')
    .lean<{ _id: Types.ObjectId; locationCode?: string }[]>();
  const code = order.map((id) => tenants.find((t) => String(t._id) === id)?.locationCode).find(Boolean);
  const base = baseLoginId(code, self);
  if (!base) return null;

  // The unique index settles a race between two people with the same parts: retry with the next.
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await EmcrAccount.find({ loginId: { $regex: `^${escape(base)}(\\.\\d+)?$` } })
      .select('loginId')
      .lean<{ loginId: string }[]>();
    const loginId = nextFreeLoginId(base, taken.map((t) => t.loginId));
    if (!loginId) return null;
    try {
      const set = await EmcrAccount.updateOne({ _id: account._id, loginId: { $exists: false } }, { $set: { loginId } });
      if (set.modifiedCount === 1) return loginId;
      const now = await EmcrAccount.findById(account._id).select('loginId').lean<{ loginId?: string } | null>();
      return now?.loginId ?? null;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  return null;
}
