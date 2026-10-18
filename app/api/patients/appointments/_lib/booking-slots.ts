import { addDays, dayHours, TimeOff, toMin, WeeklyHours } from '@/lib/doctors';
import { formatInTz } from '@/lib/tz';

/**
 * The patient booking slot grid, shared by `GET /api/patients/appointments` (which offers the
 * slots) and `POST` (which must only accept a slot the GET could have offered). No DB access.
 */

export const SLOT_MINUTES = 30;
/** How far ahead the app offers dates (today counts as day 1). */
export const BOOKING_HORIZON_DAYS = 60;

export type BookableDoctor = { status?: string; schedule?: WeeklyHours[]; availabilityOverrides?: TimeOff[] };

/** The clinic's current day and minute of day, in the clinic's timezone. */
export type ClinicClock = { today: string; nowMinutes: number };

export function clinicClock(tz: string, now: Date = new Date()): ClinicClock {
  return {
    today: formatInTz(now, 'yyyy-MM-dd', tz),
    nowMinutes: toMin(formatInTz(now, 'HH:mm', tz)) ?? 0,
  };
}

/** "yyyy-MM-dd" keys the app may book: today through the end of the horizon. */
export function bookingHorizon(today: string): string[] {
  return Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => addDays(today, i));
}

/** Doctors who never set weekly hours keep the old default: every day, 9 AM–5 PM (time off still applies). */
function withDefaultHours<T extends BookableDoctor>(doctor: T): T {
  if ((doctor.schedule ?? []).some((s) => s.isAvailable !== false)) return doctor;
  return {
    ...doctor,
    schedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' })),
  };
}

/** The doctor's bookable window that day in minutes, or null when they aren't seeing patients. */
export function bookingWindow(doctor: BookableDoctor, key: string): { start: number; end: number } | null {
  const hours = dayHours(withDefaultHours(doctor), key);
  if (hours.kind !== 'working') return null;
  const start = toMin(hours.start);
  const end = toMin(hours.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/**
 * Slot start times (minutes of day) the doctor offers on `date`, before existing bookings are
 * removed: 30-minute steps from the start of their hours, inside the booking horizon, with
 * today's past (and current) slots dropped in clinic time. Empty when the day isn't bookable.
 */
export function candidateSlots(doctor: BookableDoctor, date: string, clock: ClinicClock): number[] {
  if (date < clock.today || date > addDays(clock.today, BOOKING_HORIZON_DAYS - 1)) return [];
  const window = bookingWindow(doctor, date);
  if (!window) return [];
  const nowMinutes = date === clock.today ? clock.nowMinutes : -1;
  const slots: number[] = [];
  for (let start = window.start; start + SLOT_MINUTES <= window.end; start += SLOT_MINUTES) {
    if (start > nowMinutes) slots.push(start);
  }
  return slots;
}

export const minutesToHHmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export type SlotRejection = 'past' | 'beyond-horizon' | 'not-working' | 'off-grid';

/**
 * Why a requested booking isn't a slot the GET would offer, or null when it is one.
 * `startMinutes` is the requested time as minutes of day (null = unparseable → off-grid).
 */
export function slotRejection(
  doctor: BookableDoctor,
  date: string,
  startMinutes: number | null,
  clock: ClinicClock
): SlotRejection | null {
  if (date < clock.today) return 'past';
  if (date > addDays(clock.today, BOOKING_HORIZON_DAYS - 1)) return 'beyond-horizon';
  const window = bookingWindow(doctor, date);
  if (!window) return 'not-working';
  if (startMinutes === null || startMinutes < window.start || startMinutes + SLOT_MINUTES > window.end) {
    return 'not-working';
  }
  if (date === clock.today && startMinutes <= clock.nowMinutes) return 'past';
  return candidateSlots(doctor, date, clock).includes(startMinutes) ? null : 'off-grid';
}
