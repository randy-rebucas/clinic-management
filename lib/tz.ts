import { TZDate } from '@date-fns/tz';
import { addDays, format, startOfDay, endOfDay, startOfMonth, startOfWeek, subWeeks, subMonths, endOfMonth, endOfWeek } from 'date-fns';

/**
 * Timezone-aware date helpers. Servers and Vercel Cron run in UTC, but clinic days
 * start and end in the clinic's local time. Always compute day/week/month boundaries
 * with these helpers instead of `setHours(0,0,0,0)` or `toISOString().split('T')[0]`.
 */
export const DEFAULT_TIMEZONE = 'Asia/Manila';

/**
 * Pick the timezone to use for a clinic. 'UTC' is treated as "not set" because it is
 * the schema default in Settings.generalSettings.timezone, not a deliberate choice;
 * pass the tenant's own `settings.timezone` (chosen at onboarding) where available.
 */
export function resolveTimezone(tz?: string | null): string {
  if (!tz || tz === 'UTC') return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The given instant viewed in the clinic's timezone. */
export function inTz(date: Date | number | string, tz?: string | null): TZDate {
  return new TZDate(new Date(date).getTime(), resolveTimezone(tz));
}

/** [start, end] of the clinic-local calendar day containing `date` (as real instants). */
export function dayRangeInTz(date: Date | number | string = new Date(), tz?: string | null): { start: Date; end: Date } {
  const local = inTz(date, tz);
  return { start: new Date(startOfDay(local).getTime()), end: new Date(endOfDay(local).getTime()) };
}

/** [start, end] of the clinic-local day `offsetDays` from the day containing `date`. */
export function dayRangeOffsetInTz(offsetDays: number, date: Date | number | string = new Date(), tz?: string | null) {
  return dayRangeInTz(addDays(inTz(date, tz), offsetDays), tz);
}

/** The previous full Monday–Sunday week in clinic-local time. */
export function previousWeekRangeInTz(date: Date | number | string = new Date(), tz?: string | null) {
  const lastWeek = subWeeks(inTz(date, tz), 1);
  return {
    start: new Date(startOfWeek(lastWeek, { weekStartsOn: 1 }).getTime()),
    end: new Date(endOfWeek(lastWeek, { weekStartsOn: 1 }).getTime()),
  };
}

/** The previous full calendar month in clinic-local time. */
export function previousMonthRangeInTz(date: Date | number | string = new Date(), tz?: string | null) {
  const lastMonth = subMonths(inTz(date, tz), 1);
  return {
    start: new Date(startOfMonth(lastMonth).getTime()),
    end: new Date(endOfMonth(lastMonth).getTime()),
  };
}

/** The current calendar month (so far) in clinic-local time. */
export function monthRangeInTz(date: Date | number | string = new Date(), tz?: string | null) {
  const local = inTz(date, tz);
  return { start: new Date(startOfMonth(local).getTime()), end: new Date(endOfMonth(local).getTime()) };
}

/** Clinic-local hour (0-23) of an instant. */
export function hourInTz(date: Date | number | string = new Date(), tz?: string | null): number {
  return inTz(date, tz).getHours();
}

/** Format an instant in the clinic's timezone, e.g. formatInTz(d, 'yyyy-MM-dd'). */
export function formatInTz(date: Date | number | string, pattern: string, tz?: string | null): string {
  return format(inTz(date, tz), pattern);
}

/**
 * Build the real instant for a clinic-local date + "HH:mm" time.
 * `dateOnly` may be a Date (its clinic-local calendar day is used) or "yyyy-MM-dd".
 */
export function combineDateAndTimeInTz(dateOnly: Date | string, time: string | null | undefined, tz?: string | null): Date {
  const zone = resolveTimezone(tz);
  const ymd = typeof dateOnly === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)
    ? dateOnly
    : formatInTz(dateOnly, 'yyyy-MM-dd', zone);
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = (time && /^\d{1,2}:\d{2}/.test(time) ? time : '00:00').split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, zone).getTime());
}
