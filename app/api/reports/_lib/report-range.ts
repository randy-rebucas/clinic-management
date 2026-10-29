import { startOfWeek, endOfWeek } from 'date-fns';
import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { combineDateAndTimeInTz, dayRangeInTz, dayRangeOffsetInTz, formatInTz, inTz, monthRangeInTz, previousMonthRangeInTz } from '@/lib/tz';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { canOpenReport, type ReportKey } from '@/lib/reports';
import { logReportOpened } from './report-audit';

/** Upper bound on custom report windows, so a single request can't scan years of data. */
export const MAX_REPORT_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a date query param. "yyyy-MM-dd" is read as a clinic-local calendar day and
 * snapped to its start or end; anything else must be a parseable instant.
 */
export function parseDateParam(value: string | null, tz: string, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? combineDateAndTimeInTz(value, '00:00', tz)
    : new Date(value);
  if (Number.isNaN(day.getTime())) return null;
  const range = dayRangeInTz(day, tz);
  return edge === 'start' ? range.start : range.end;
}

/** Current day / week (Sunday start) / month in clinic-local time. */
export function periodRange(period: string, tz: string, now: Date = new Date()): { start: Date; end: Date } {
  switch (period) {
    case 'daily':
      return dayRangeInTz(now, tz);
    case 'weekly': {
      const local = inTz(now, tz);
      return {
        start: new Date(startOfWeek(local, { weekStartsOn: 0 }).getTime()),
        end: new Date(endOfWeek(local, { weekStartsOn: 0 }).getTime()),
      };
    }
    case 'last-month':
      return previousMonthRangeInTz(now, tz);
    case 'monthly':
    default:
      return monthRangeInTz(now, tz);
  }
}

/** Every clinic-local day key from start to end, for charts that need the empty days too. */
export function dayKeys(start: Date, end: Date, tz: string): string[] {
  const keys: string[] = [];
  const last = formatInTz(end, 'yyyy-MM-dd', tz);
  let cursor = start;
  for (let i = 0; i < 400; i++) {
    const key = formatInTz(cursor, 'yyyy-MM-dd', tz);
    keys.push(key);
    if (key >= last) break;
    cursor = dayRangeOffsetInTz(1, cursor, tz).start;
  }
  return keys;
}

/**
 * Session, permission and range checks shared by the report routes. A refusal and the report
 * opened both reach the audit log.
 */
export async function openReport(
  request: NextRequest,
  key: ReportKey
): Promise<NextResponse | { tenantId: string; tenantObjectId: Types.ObjectId; tz: string; start: Date; end: Date }> {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const can = await getPermissionChecker(ctx.session);
  if (!canOpenReport(can, key)) {
    return refuseAccess({ ...ctx.session, tenantId: ctx.tenantId }, 'You don’t have access to this report', 'reports', 'read');
  }
  const tz = await getTenantTimezone(ctx.tenantId);
  const range = resolveReportRange(request.nextUrl.searchParams, tz);
  if (isRangeError(range)) return NextResponse.json({ success: false, error: range.error }, { status: 400 });
  await logReportOpened(ctx, request, key, range, tz);
  return { tenantId: ctx.tenantId, tenantObjectId: ctx.tenantObjectId, tz, ...range };
}

/**
 * Resolve the report window from `startDate`/`endDate` (both required for a custom
 * window) or the named `period`. Returns an error string for invalid or oversized ranges.
 */
export function resolveReportRange(
  searchParams: URLSearchParams,
  tz: string,
  maxDays: number = MAX_REPORT_RANGE_DAYS
): { start: Date; end: Date } | { error: string } {
  const startParam = searchParams.get('startDate');
  const endParam = searchParams.get('endDate');
  if (startParam && endParam) {
    const start = parseDateParam(startParam, tz, 'start');
    const end = parseDateParam(endParam, tz, 'end');
    if (!start || !end) return { error: 'Invalid date range' };
    if (start > end) return { error: 'startDate must be before endDate' };
    if (end.getTime() - start.getTime() > maxDays * DAY_MS) {
      return { error: `Date range cannot exceed ${maxDays} days` };
    }
    return { start, end };
  }
  return periodRange(searchParams.get('period') || 'monthly', tz);
}

export function isRangeError(value: { start: Date; end: Date } | { error: string }): value is { error: string } {
  return 'error' in value;
}

/** Clinic-local "yyyy-MM-dd" key for grouping by day. */
export function dateKeyInTz(date: Date | string | number, tz: string): string {
  return formatInTz(date, 'yyyy-MM-dd', tz);
}
