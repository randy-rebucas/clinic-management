import type { NextRequest } from 'next/server';
import Specialization from '@/models/Specialization';
import { createAuditLog } from '@/lib/audit';
import type { TenantSession } from '@/lib/api/tenant-session';
import { STATUS_LABEL, WEEKDAY_SHORT, hoursRange, weekSummary, type DoctorStatus } from '@/lib/doctors';

/**
 * How a doctor's profile reaches the audit log: every add, change and removal, with the
 * values in words (the specialty's name, not its id; hours as "Mon–Fri 9 AM–5 PM").
 */

type Snapshot = Record<string, any>;
type Change = { field: string; oldValue: unknown; newValue: unknown };

/** "Dr. Ana Reyes"; the title the profile carries, "Dr." when none. */
export const doctorLabel = (d: { title?: string; firstName?: string; lastName?: string }) =>
  `${d.title?.trim() || 'Dr.'} ${d.firstName ?? ''} ${d.lastName ?? ''}`.replace(/\s+/g, ' ').trim();

/** Profile fields compared on a change, in the order the form shows them. */
const PLAIN_FIELDS = [
  'title', 'firstName', 'lastName', 'email', 'phone', 'licenseNumber', 'ptr', 'philhealthPan', 's2Number',
  'department', 'bio',
] as const;

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b);

/** "Mon, Nov 3: off (Conference)" / "Sat, Nov 8: 9 AM–12 PM". Dates are stored at noon UTC. */
function timeOffWords(o: { date: Date | string; isAvailable?: boolean; startTime?: string; endTime?: string; reason?: string }) {
  const d = new Date(o.date);
  const day = `${WEEKDAY_SHORT[d.getUTCDay()]}, ${d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`;
  const what = o.isAvailable && o.startTime && o.endTime ? hoursRange(o.startTime, o.endTime) : 'off';
  return `${day}: ${what}${o.reason?.trim() ? ` (${o.reason.trim()})` : ''}`;
}

/** The specialties' names by id, for the ids given (the catalogue is shared by all clinics). */
async function specialtyNames(ids: unknown[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((v) => !blank(v)).map(String))];
  if (!wanted.length) return new Map();
  const rows = await Specialization.find({ _id: { $in: wanted } }).select('name').lean<{ _id: unknown; name: string }[]>();
  return new Map(rows.map((r) => [String(r._id), r.name]));
}

/** The id behind a specializationId that may be populated. */
const specId = (v: any) => (v && typeof v === 'object' && '_id' in v ? v._id : v);

/**
 * What changed between two versions of a doctor's profile, values in words. Fields left out
 * of `after` (a partial update) are not compared.
 */
export async function doctorChanges(before: Snapshot, after: Snapshot): Promise<Change[]> {
  const changes: Change[] = [];

  for (const field of PLAIN_FIELDS) {
    if (!(field in after) || same(before[field], after[field])) continue;
    changes.push({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null });
  }

  if ('specializationId' in after && String(specId(before.specializationId) ?? '') !== String(specId(after.specializationId) ?? '')) {
    const was = specId(before.specializationId);
    const now = specId(after.specializationId);
    const names = await specialtyNames([was, now]);
    changes.push({
      field: 'specialization',
      oldValue: blank(was) ? null : names.get(String(was)) ?? 'A specialty no longer on file',
      newValue: blank(now) ? null : names.get(String(now)) ?? 'A specialty no longer on file',
    });
  }

  if ('qualifications' in after && !same(before.qualifications, after.qualifications)) {
    changes.push({
      field: 'qualifications',
      oldValue: (before.qualifications ?? []).join(', ') || null,
      newValue: (after.qualifications ?? []).join(', ') || null,
    });
  }

  if ('status' in after && before.status !== after.status) {
    changes.push({
      field: 'status',
      oldValue: STATUS_LABEL[before.status as DoctorStatus] ?? before.status ?? null,
      newValue: STATUS_LABEL[after.status as DoctorStatus] ?? after.status ?? null,
    });
  }

  if ('schedule' in after) {
    const was = weekSummary(before.schedule ?? []);
    const now = weekSummary(after.schedule ?? []);
    if (was !== now) changes.push({ field: 'weeklyHours', oldValue: was, newValue: now });
  }

  if ('availabilityOverrides' in after) {
    // Only the days that came or went: the list grows over the years and isn't worth repeating.
    const was = (before.availabilityOverrides ?? []).map(timeOffWords);
    const now = (after.availabilityOverrides ?? []).map(timeOffWords);
    const removed = was.filter((w: string) => !now.includes(w));
    const added = now.filter((w: string) => !was.includes(w));
    if (removed.length || added.length) {
      changes.push({ field: 'timeOff', oldValue: removed.length ? removed : null, newValue: added.length ? added : null });
    }
  }

  return changes;
}

/** "Marked Dr. Ana Reyes inactive", or "Changed Dr. Ana Reyes: specialization, phone". */
export function changedSentence(name: string, changes: Change[]) {
  if (changes.length === 1 && changes[0].field === 'status') return `Marked ${name} ${String(changes[0].newValue).toLowerCase()}`;
  return `Changed ${name}: ${changes.map((c) => c.field).join(', ')}`;
}

export async function logDoctorChange(
  ctx: TenantSession,
  request: NextRequest,
  entry: {
    action: 'create' | 'update' | 'delete';
    doctorId: unknown;
    description: string;
    changes?: Change[];
    metadata?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
  }
) {
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: entry.action,
    resource: 'doctor',
    resourceId: String(entry.doctorId),
    description: entry.description,
    changes: entry.changes?.length ? entry.changes : undefined,
    metadata: entry.metadata,
    success: entry.success,
    errorMessage: entry.errorMessage,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
