import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Role from '@/models/Role';
import User from '@/models/User';
import { resolveTimezone, formatInTz } from '@/lib/tz';
import { nextAppointmentCode as bookingNextAppointmentCode } from '@/lib/appointment-booking';
import { createNotification, type CreateNotificationOptions } from '@/lib/notifications';

export { escapeHtml } from '@/lib/email';

/** Upper bound on records a single automation run handles per tenant. */
export const BATCH_LIMIT = 500;

export interface AutomationTenant {
  tenantId: string;
  tenantObjectId: Types.ObjectId;
  name: string;
  timezone: string;
}

function toAutomationTenant(t: any): AutomationTenant {
  return {
    tenantId: String(t._id),
    tenantObjectId: new Types.ObjectId(String(t._id)),
    name: t.displayName || t.name || '',
    timezone: resolveTimezone(t.settings?.timezone),
  };
}

export async function getActiveTenants(): Promise<AutomationTenant[]> {
  await connectDB();
  const tenants = await Tenant.find({ status: 'active' })
    .select('_id name displayName settings.timezone')
    .lean();
  return (tenants as any[]).map(toAutomationTenant);
}

export async function getAutomationTenant(
  tenantId: string | Types.ObjectId
): Promise<AutomationTenant | null> {
  if (!tenantId || !Types.ObjectId.isValid(String(tenantId))) return null;
  await connectDB();
  const tenant = await Tenant.findById(String(tenantId))
    .select('_id name displayName settings.timezone')
    .lean();
  return tenant ? toAutomationTenant(tenant) : null;
}

/** Clinic timezone for a tenant (Tenant.settings.timezone, fallback Asia/Manila). */
export async function getTenantTimezone(tenantId?: string | Types.ObjectId | null): Promise<string> {
  if (!tenantId) return resolveTimezone(null);
  const tenant = await getAutomationTenant(tenantId);
  return tenant?.timezone ?? resolveTimezone(null);
}

export interface TenantRunResult<T> {
  tenantId: string;
  success: boolean;
  result?: T;
  error?: string;
}

/** Clinics an all-tenant run works on at once. */
const TENANT_CONCURRENCY = 3;

/**
 * Time an all-tenant run may spend starting clinics; crons get maxDuration 300 s, so this leaves
 * room for the clinics already started to finish. Clinics not reached are reported as skipped.
 */
export const RUN_BUDGET_MS = Number(process.env.AUTOMATION_RUN_BUDGET_MS) || 240_000;

/**
 * Run `fn` for one tenant (when `tenantId` is given) or for every active tenant.
 * A failure in one tenant never stops the others. All-tenant runs work on a few clinics at a time,
 * start from a different clinic each run (so a run cut short doesn't always miss the same ones)
 * and stop starting clinics once the time budget is spent.
 */
export async function forEachTenant<T>(
  tenantId: string | Types.ObjectId | null | undefined,
  fn: (tenant: AutomationTenant) => Promise<T>,
  options: { budgetMs?: number; concurrency?: number } = {}
): Promise<TenantRunResult<T>[]> {
  let tenants: AutomationTenant[];
  if (tenantId) {
    const one = await getAutomationTenant(tenantId);
    tenants = one ? [one] : [];
  } else {
    tenants = rotate(await getActiveTenants(), Math.floor(Date.now() / 60_000));
  }

  const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
  const results: TenantRunResult<T>[] = new Array(tenants.length);
  let next = 0;
  const worker = async () => {
    while (next < tenants.length) {
      const i = next++;
      const tenant = tenants[i];
      if (Date.now() > deadline) {
        results[i] = { tenantId: tenant.tenantId, success: false, error: 'Skipped: the run ran out of time' };
        continue;
      }
      try {
        results[i] = { tenantId: tenant.tenantId, success: true, result: await fn(tenant) };
      } catch (error) {
        console.error(`[automation] tenant ${tenant.tenantId} failed:`, error);
        results[i] = { tenantId: tenant.tenantId, success: false, error: errorMessage(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? TENANT_CONCURRENCY, tenants.length) }, worker));

  const skipped = results.filter((r) => r.error?.startsWith('Skipped')).length;
  if (skipped) console.warn(`[automation] ${skipped} of ${tenants.length} tenants skipped: run time budget spent`);
  return results;
}

/** The list starting at position `offset` (wrapping), so each run begins somewhere else. */
export function rotate<T>(items: T[], offset: number): T[] {
  if (items.length < 2) return items;
  const k = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

/** A claim older than this is treated as abandoned (the run that took it died mid-send). */
export const CLAIM_TTL_MS = 15 * 60 * 1000;

/**
 * Claim one record before sending to it, so overlapping runs (a rerun, a manual trigger, two
 * cron invocations) can't both send. `filter` must also say "not sent yet". Returns false when
 * the record is already sent or another run holds a fresh claim.
 */
export async function claimForSend(
  model: { updateOne: (filter: any, update: any) => Promise<{ modifiedCount: number }> },
  filter: Record<string, unknown>,
  claimField: string
): Promise<boolean> {
  const now = new Date();
  const res = await model.updateOne(
    {
      $and: [
        filter,
        { $or: [{ [claimField]: { $exists: false } }, { [claimField]: null }, { [claimField]: { $lt: new Date(now.getTime() - CLAIM_TTL_MS) } }] },
      ],
    },
    { $set: { [claimField]: now } }
  );
  return res.modifiedCount === 1;
}

/** Give a claimed record back (the send failed) so the next run can try again. */
export async function releaseClaim(
  model: { updateOne: (filter: any, update: any) => Promise<unknown> },
  filter: Record<string, unknown>,
  claimField: string
): Promise<void> {
  await model.updateOne(filter, { $unset: { [claimField]: '' } });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when a send result means the message actually went out (not just logged). */
export function delivered(result: { success: boolean; skipped?: boolean } | null | undefined): boolean {
  return !!result && result.success && !result.skipped;
}

/** Allocate the next APT-xxxxxx appointment code; one source of truth with the booking API. */
export async function nextAppointmentCode(tenantId: string | Types.ObjectId): Promise<string> {
  return bookingNextAppointmentCode(tenantId);
}

/** Reads settings.automationSettings[key]; anything other than an explicit `false` counts as on. */
export function automationEnabled(settings: any, key: string): boolean {
  return settings?.automationSettings?.[key] !== false;
}

/**
 * Active staff users of a tenant holding one of the given role names.
 * User.role is an ObjectId, so roles are resolved by name first (tenant roles or global ones).
 */
export async function getTenantStaff(
  tenantId: string | Types.ObjectId,
  roleNames: string[],
  select = '_id name email'
): Promise<any[]> {
  const tid = new Types.ObjectId(String(tenantId));
  const roles = await Role.find({
    name: { $in: roleNames },
    $or: [{ tenantId: tid }, { tenantId: { $exists: false } }, { tenantId: null }],
  })
    .select('_id')
    .lean();
  if (!roles.length) return [];
  return User.find({
    tenantId: tid,
    status: 'active',
    role: { $in: (roles as any[]).map((r) => r._id) },
  })
    .select(select)
    .limit(200)
    .lean();
}

/** In-app notification that never throws (a failed notification must not undo a send). */
export async function safeNotify(options: CreateNotificationOptions): Promise<boolean> {
  try {
    await createNotification(options);
    return true;
  } catch (error) {
    console.error('[automation] in-app notification failed:', errorMessage(error));
    return false;
  }
}

/**
 * Threshold-based reminders ("30, 7, 1 days before"). Returns the smallest threshold the
 * record has crossed if it hasn't been sent yet, plus every crossed threshold so they can
 * all be recorded. A missed run still fires on the next one; reruns never resend.
 */
export function pendingThreshold(
  daysLeft: number,
  thresholds: number[],
  sent: number[] | null | undefined
): { level: number; crossed: number[] } | null {
  const crossed = thresholds.filter((t) => daysLeft <= t);
  if (crossed.length === 0) return null;
  const level = Math.min(...crossed);
  if ((sent || []).includes(level)) return null;
  return { level, crossed };
}

/** Whole clinic-local calendar days from today until `date` (negative when past). */
export function daysUntilInTz(date: Date | string | number, tz: string, now: Date = new Date()): number {
  const target = formatInTz(date, 'yyyy-MM-dd', tz);
  const today = formatInTz(now, 'yyyy-MM-dd', tz);
  return Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

/** "14:30" → "2:30 PM"; anything unparseable is returned as-is ('TBD' when empty). */
export function displayTime(hhmm: string | null | undefined): string {
  if (!hhmm) return 'TBD';
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Human date in the clinic's timezone, e.g. "Mar 5, 2026". */
export function displayDate(date: Date | string | number | null | undefined, tz: string): string {
  if (!date) return '';
  return formatInTz(date, 'MMM d, yyyy', tz);
}

export function personName(p: { firstName?: string; lastName?: string } | null | undefined): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}
