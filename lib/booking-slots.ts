import { addDays, dayHours, TimeOff, toMin, WEEKDAY_KEYS, weekdayOf, WeeklyHours } from '@/lib/doctors';
import { formatInTz } from '@/lib/tz';

/**
 * The online booking slot grid, shared by the public web booking (`/api/appointments/public`)
 * and the patient app (`/api/patients/appointments`): each GET offers these slots and each POST
 * accepts only a slot its GET could have offered. Pure — no DB access.
 *
 * A slot is offered when it lies inside BOTH the clinic's opening hours for that weekday
 * (Settings.businessHours; a closed day offers nothing) AND the doctor's hours that day
 * (weekly schedule + time off, see `dayHours`). Slots step by the clinic's usual appointment
 * length (Settings.appointmentSettings.defaultDuration) from the start of that shared window.
 * All days and times are clinic-local (the clinic's timezone, see `clinicClock`).
 */

export const DEFAULT_SLOT_MINUTES = 30;
/** Kept for callers that predate the clinic's own appointment length. */
export const SLOT_MINUTES = DEFAULT_SLOT_MINUTES;
/** How far ahead online booking offers dates (today counts as day 1). */
export const BOOKING_HORIZON_DAYS = 60;

export type BookableDoctor = { status?: string; schedule?: WeeklyHours[]; availabilityOverrides?: TimeOff[] };

/** One row of Settings.businessHours ("monday" … "sunday", "HH:mm"). */
export type ClinicOpeningDay = { day: string; open?: string | null; close?: string | null; closed?: boolean };

export type BookingRules = {
  /** The clinic's opening hours; missing/empty = no clinic constraint (legacy 9–5 doctor default). */
  businessHours?: ClinicOpeningDay[] | null;
  /** Slot length and step in minutes (the clinic's usual appointment length). */
  slotMinutes?: number;
};

/** The booking rules from a clinic Settings object (as `getSettings` returns it). */
export function bookingRulesFrom(settings: {
  businessHours?: ClinicOpeningDay[] | null;
  appointmentSettings?: { defaultDuration?: number | null } | null;
} | null | undefined): Required<BookingRules> {
  return {
    businessHours: settings?.businessHours ?? [],
    slotMinutes: slotMinutesOf({ slotMinutes: settings?.appointmentSettings?.defaultDuration ?? undefined }),
  };
}

/** The slot length in force: the clinic's whole-minute setting (5–480), else 30. */
export function slotMinutesOf(rules?: BookingRules): number {
  const m = Number(rules?.slotMinutes);
  return Number.isInteger(m) && m >= 5 && m <= 480 ? m : DEFAULT_SLOT_MINUTES;
}

/** The clinic's current day and minute of day, in the clinic's timezone. */
export type ClinicClock = { today: string; nowMinutes: number };

export function clinicClock(tz: string, now: Date = new Date()): ClinicClock {
  return {
    today: formatInTz(now, 'yyyy-MM-dd', tz),
    nowMinutes: toMin(formatInTz(now, 'HH:mm', tz)) ?? 0,
  };
}

/** "yyyy-MM-dd" keys online booking may offer: today through the end of the horizon. */
export function bookingHorizon(today: string): string[] {
  return Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => addDays(today, i));
}

type Window = { start: number; end: number };

const hasHours = (rules?: BookingRules) => (rules?.businessHours ?? []).length > 0;

function openingDay(rules: BookingRules | undefined, key: string): ClinicOpeningDay | undefined {
  const name = WEEKDAY_KEYS[weekdayOf(key)];
  return (rules?.businessHours ?? []).find((h) => String(h.day).toLowerCase() === name);
}

/**
 * The clinic's opening window on `key`: null when closed, `undefined` when there is no usable
 * opening-hours row for that weekday (no clinic constraint).
 */
export function clinicWindow(rules: BookingRules | undefined, key: string): Window | null | undefined {
  const day = openingDay(rules, key);
  if (!day) return undefined;
  if (day.closed) return null;
  const start = toMin(day.open);
  const end = toMin(day.close);
  return start !== null && end !== null && end > start ? { start, end } : undefined;
}

/**
 * A doctor who never set weekly hours is treated as working whenever the clinic is open (its
 * opening hours become their weekly hours), so clinics that never filled in rosters still get
 * slots. Without opening hours either, the legacy default applies: every day, 9 AM–5 PM.
 * Time off and leave still apply either way.
 */
function withDefaultHours<T extends BookableDoctor>(doctor: T, rules?: BookingRules): T {
  if ((doctor.schedule ?? []).some((s) => s.isAvailable !== false)) return doctor;
  const schedule: WeeklyHours[] = hasHours(rules)
    ? WEEKDAY_KEYS.flatMap((name, dayOfWeek) => {
        const day = (rules?.businessHours ?? []).find((h) => String(h.day).toLowerCase() === name);
        return day && !day.closed && day.open && day.close
          ? [{ dayOfWeek, startTime: day.open, endTime: day.close }]
          : [];
      })
    : [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' }));
  return { ...doctor, schedule };
}

/**
 * The bookable window that day in minutes — the doctor's hours narrowed to the clinic's opening
 * hours — or null when the doctor isn't seeing patients or the clinic is closed.
 */
export function bookingWindow(doctor: BookableDoctor, key: string, rules?: BookingRules): Window | null {
  const clinic = clinicWindow(rules, key);
  if (clinic === null) return null;
  const hours = dayHours(withDefaultHours(doctor, rules), key);
  if (hours.kind !== 'working') return null;
  let start = toMin(hours.start);
  let end = toMin(hours.end);
  if (start === null || end === null) return null;
  if (clinic) {
    start = Math.max(start, clinic.start);
    end = Math.min(end, clinic.end);
  }
  return end > start ? { start, end } : null;
}

const inHorizon = (date: string, clock: ClinicClock) =>
  date >= clock.today && date <= addDays(clock.today, BOOKING_HORIZON_DAYS - 1);

/**
 * Slot start times (minutes of day) the doctor offers on `date`, before existing bookings are
 * removed: slot-length steps from the start of the bookable window, inside the booking horizon,
 * with today's past (and current) slots dropped in clinic time. Empty when the day isn't bookable.
 */
export function candidateSlots(doctor: BookableDoctor, date: string, clock: ClinicClock, rules?: BookingRules): number[] {
  if (!inHorizon(date, clock)) return [];
  const window = bookingWindow(doctor, date, rules);
  if (!window) return [];
  const step = slotMinutesOf(rules);
  const nowMinutes = date === clock.today ? clock.nowMinutes : -1;
  const slots: number[] = [];
  for (let start = window.start; start + step <= window.end; start += step) {
    if (start > nowMinutes) slots.push(start);
  }
  return slots;
}

/** An existing appointment of the doctor that day: start minute and length (minutes). */
export type BookedTime = { start: number; duration?: number | null };

/** Candidate slots minus those overlapping an existing (non-cancelled) appointment. */
export function freeSlots(
  doctor: BookableDoctor,
  date: string,
  clock: ClinicClock,
  booked: BookedTime[],
  rules?: BookingRules
): number[] {
  const step = slotMinutesOf(rules);
  return candidateSlots(doctor, date, clock, rules).filter(
    (slot) => !booked.some((b) => slot < b.start + (b.duration || DEFAULT_SLOT_MINUTES) && b.start < slot + step)
  );
}

/** When the patient doesn't pick a doctor: a slot is free when at least one doctor is free then. */
export function freeSlotsAnyDoctor(
  doctors: { doctor: BookableDoctor; booked: BookedTime[] }[],
  date: string,
  clock: ClinicClock,
  rules?: BookingRules
): number[] {
  const all = new Set<number>();
  for (const { doctor, booked } of doctors) {
    for (const slot of freeSlots(doctor, date, clock, booked, rules)) all.add(slot);
  }
  return [...all].sort((a, b) => a - b);
}

export const minutesToHHmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export type SlotRejection = 'past' | 'beyond-horizon' | 'not-working' | 'off-grid';

/**
 * Why a requested booking isn't a slot the GET would offer, or null when it is one.
 * `startMinutes` is the requested time as minutes of day (null = unparseable → not-working).
 * Existing bookings are checked separately (findDoctorConflict) at write time.
 */
export function slotRejection(
  doctor: BookableDoctor,
  date: string,
  startMinutes: number | null,
  clock: ClinicClock,
  rules?: BookingRules
): SlotRejection | null {
  if (date < clock.today) return 'past';
  if (date > addDays(clock.today, BOOKING_HORIZON_DAYS - 1)) return 'beyond-horizon';
  const window = bookingWindow(doctor, date, rules);
  if (!window) return 'not-working';
  if (startMinutes === null || startMinutes < window.start || startMinutes + slotMinutesOf(rules) > window.end) {
    return 'not-working';
  }
  if (date === clock.today && startMinutes <= clock.nowMinutes) return 'past';
  return candidateSlots(doctor, date, clock, rules).includes(startMinutes) ? null : 'off-grid';
}
