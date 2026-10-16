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

/**
 * Run `fn` for one tenant (when `tenantId` is given) or for every active tenant.
 * Tenants run sequentially and a failure in one never stops the others.
 */
export async function forEachTenant<T>(
  tenantId: string | Types.ObjectId | null | undefined,
  fn: (tenant: AutomationTenant) => Promise<T>
): Promise<TenantRunResult<T>[]> {
  let tenants: AutomationTenant[];
  if (tenantId) {
    const one = await getAutomationTenant(tenantId);
    tenants = one ? [one] : [];
  } else {
    tenants = await getActiveTenants();
  }

  const results: TenantRunResult<T>[] = [];
  for (const tenant of tenants) {
    try {
      results.push({ tenantId: tenant.tenantId, success: true, result: await fn(tenant) });
    } catch (error) {
      console.error(`[automation] tenant ${tenant.tenantId} failed:`, error);
      results.push({ tenantId: tenant.tenantId, success: false, error: errorMessage(error) });
    }
  }
  return results;
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
