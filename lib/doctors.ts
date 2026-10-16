// Doctor schedule rules shared by the API and the doctors screens (no server imports).

export type DoctorStatus = 'active' | 'on-leave' | 'inactive';
export const DOCTOR_STATUSES: DoctorStatus[] = ['active', 'on-leave', 'inactive'];

export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Rows of the weekly-hours editor and the record page: the working week first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface WeeklyHours {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable?: boolean;
}

export interface TimeOff {
  _id?: string;
  /** ISO instant; its calendar day is read in UTC (see `timeOffDate`). */
  date: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface BusinessDay {
  day: string;
  open: string | null;
  close: string | null;
  closed: boolean;
}

export type DayHours =
  | { kind: 'working'; start: string; end: string; changed: boolean; reason?: string }
  | { kind: 'off'; reason?: string; timeOff: boolean }
  | { kind: 'leave' }
  | { kind: 'inactive' };

export const toMin = (hhmm?: string | null) => {
  const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Weekday (0 = Sunday) of a "yyyy-MM-dd" calendar day. */
export const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

export function addDays(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Sunday that starts the week holding `key` (the reports' week, Sunday to Saturday). */
export const weekStartOf = (key: string) => addDays(key, -weekdayOf(key));

/**
 * Time off is stored at noon UTC of its calendar day, so the day reads the same in every clinic
 * timezone. Older entries saved at midnight UTC still read as the intended day for UTC+ clinics.
 */
export const timeOffDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);
export const timeOffInstant = (key: string) => `${key}T12:00:00.000Z`;

/** What a doctor's day looks like: status first, then that date's time off, then the weekly hours. */
export function dayHours(
  doctor: { status?: string; schedule?: WeeklyHours[]; availabilityOverrides?: TimeOff[] },
  key: string
): DayHours {
  if (doctor.status === 'inactive') return { kind: 'inactive' };
  if (doctor.status === 'on-leave') return { kind: 'leave' };
  const override = (doctor.availabilityOverrides ?? []).find((o) => timeOffDate(o.date) === key);
  const weekly = (doctor.schedule ?? []).find((s) => s.dayOfWeek === weekdayOf(key) && s.isAvailable !== false);
  if (override) {
    if (!override.isAvailable) return { kind: 'off', reason: override.reason, timeOff: true };
    const start = override.startTime || weekly?.startTime;
    const end = override.endTime || weekly?.endTime;
    if (start && end) return { kind: 'working', start, end, changed: true, reason: override.reason };
  }
  if (weekly) return { kind: 'working', start: weekly.startTime, end: weekly.endTime, changed: false };
  return { kind: 'off', timeOff: false };
}

/** "9 AM", "9:30 AM", "12 PM". */
export function clock(hhmm: string) {
  const m = toMin(hhmm);
  if (m === null) return hhmm;
  const h24 = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export const hoursRange = (start: string, end: string) => `${clock(start)}–${clock(end)}`;

/** "Mon–Fri 9 AM–5 PM · Sat 9 AM–12 PM", or null when no weekly hours are set. */
export function weekSummary(schedule: WeeklyHours[] = []) {
  const runs: { from: number; to: number; hours: string }[] = [];
  for (const day of WEEK_ORDER) {
    const s = schedule.find((x) => x.dayOfWeek === day && x.isAvailable !== false);
    if (!s) continue;
    const hours = hoursRange(s.startTime, s.endTime);
    const last = runs[runs.length - 1];
    const prevDay = last ? WEEK_ORDER[WEEK_ORDER.indexOf(day) - 1] : null;
    if (last && last.hours === hours && last.to === prevDay) last.to = day;
    else runs.push({ from: day, to: day, hours });
  }
  if (runs.length === 0) return null;
  return runs
    .map((r) => `${WEEKDAY_SHORT[r.from]}${r.to !== r.from ? `${WEEK_ORDER.indexOf(r.to) - WEEK_ORDER.indexOf(r.from) > 1 ? '–' : ', '}${WEEKDAY_SHORT[r.to]}` : ''} ${r.hours}`)
    .join(' · ');
}

/** Weekly-hours problems by weekday, for the editor and the API. */
export function hoursProblems(schedule: WeeklyHours[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of schedule) {
    if (s.isAvailable === false) continue;
    const a = toMin(s.startTime);
    const b = toMin(s.endTime);
    if (a === null || b === null) out[s.dayOfWeek] = 'Enter both times.';
    else if (b <= a) out[s.dayOfWeek] = 'The day must end after it starts.';
  }
  return out;
}

export const STATUS_LABEL: Record<DoctorStatus, string> = {
  active: 'Active',
  'on-leave': 'On leave',
  inactive: 'Inactive',
};
