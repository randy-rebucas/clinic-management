import 'server-only';
import { Types } from 'mongoose';
import { createAuditLog, recentlyLogged } from '@/lib/audit';
import type { TenantSession } from '@/lib/api/tenant-session';
import { formatInTz } from '@/lib/tz';
import { REPORTS, type ReportKey } from '@/lib/reports';

/**
 * How the reports reach the audit log: a report opened, with the period it covered, and a
 * report downloaded as CSV. The figures themselves are never copied into the log. Reports
 * that list patients by name (BIR books, HMO claims) are marked sensitive.
 */

/** Reports whose rows name patients; the rest are totals. */
const NAMES_PATIENTS: ReportKey[] = ['bir', 'hmo-claims'];

/** "Oct 1–31, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2025 – Jan 3, 2026", "Oct 30, 2026". */
export function periodWords(start: Date | string, end: Date | string, tz: string): string {
  const [sy, sm, sd] = [formatInTz(start, 'yyyy', tz), formatInTz(start, 'MMM', tz), formatInTz(start, 'd', tz)];
  const [ey, em, ed] = [formatInTz(end, 'yyyy', tz), formatInTz(end, 'MMM', tz), formatInTz(end, 'd', tz)];
  if (sy !== ey) return `${sm} ${sd}, ${sy} – ${em} ${ed}, ${ey}`;
  if (sm !== em) return `${sm} ${sd} – ${em} ${ed}, ${ey}`;
  if (sd !== ed) return `${sm} ${sd}–${ed}, ${ey}`;
  return `${sm} ${sd}, ${ey}`;
}

/** "the Income report for Oct 1–31, 2026"; a snapshot report has no period. */
export function reportWords(key: ReportKey, range: { start: Date | string; end: Date | string } | null, tz: string): string {
  const meta = REPORTS.find((r) => r.key === key);
  const name = `the ${meta?.label ?? key} report`;
  return meta?.ranged && range ? `${name} for ${periodWords(range.start, range.end, tz)}` : name;
}

type Who = Pick<TenantSession, 'session' | 'tenantId'>;
type Req = { headers: Headers; method: string; nextUrl: { pathname: string } };

function entry(who: Who, request: Req, key: ReportKey, range: { start: Date | string; end: Date | string } | null, tz: string) {
  const ranged = REPORTS.find((r) => r.key === key)?.ranged ? range : null;
  return {
    userId: who.session.userId,
    userEmail: who.session.email,
    userRole: who.session.role,
    tenantId: who.tenantId,
    resource: 'report' as const,
    isSensitive: NAMES_PATIENTS.includes(key),
    metadata: {
      report: key,
      ...(ranged ? { from: formatInTz(ranged.start, 'yyyy-MM-dd', tz), to: formatInTz(ranged.end, 'yyyy-MM-dd', tz) } : {}),
    },
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  };
}

/**
 * A report opened. Logged once per person, report and period every 5 minutes, so switching
 * tabs back and forth or the page refetching doesn't count as opening it again.
 */
export async function logReportOpened(who: Who, request: Req, key: ReportKey, range: { start: Date; end: Date }, tz: string) {
  if (!Types.ObjectId.isValid(who.session.userId)) return;
  const e = entry(who, request, key, range, tz);
  const seen: Record<string, unknown> = {
    userId: new Types.ObjectId(who.session.userId),
    tenantId: new Types.ObjectId(who.tenantId),
    action: 'view',
    resource: 'report',
    ...Object.fromEntries(Object.entries(e.metadata).map(([k, v]) => [`metadata.${k}`, v])),
  };
  if (await recentlyLogged(seen, 5)) return;
  await createAuditLog({ ...e, action: 'view', description: `Opened ${reportWords(key, range, tz)}` });
}

/** A report downloaded as CSV. Each download is another copy outside the system, so every one is logged. */
export async function logReportDownloaded(who: Who, request: Req, key: ReportKey, range: { start: Date | string; end: Date | string } | null, tz: string) {
  await createAuditLog({ ...entry(who, request, key, range, tz), action: 'download', description: `Downloaded ${reportWords(key, range, tz)} as CSV` });
}
