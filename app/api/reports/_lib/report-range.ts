import { startOfWeek, endOfWeek } from 'date-fns';
import { combineDateAndTimeInTz, dayRangeInTz, formatInTz, inTz, monthRangeInTz } from '@/lib/tz';

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
    case 'monthly':
    default:
      return monthRangeInTz(now, tz);
  }
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
