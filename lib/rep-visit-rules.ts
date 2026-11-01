import { z } from 'zod';

/**
 * Medical-rep visits booked with a clinic: the clinic's visiting hours, the slots they open and
 * the status rules. Client-safe (the clinic's settings form uses it); server code is in
 * lib/rep-visits.ts.
 */

export const REP_VISIT_STATUSES = ['requested', 'scheduled', 'declined', 'completed', 'cancelled', 'no-show'] as const;
export type RepVisitStatus = (typeof REP_VISIT_STATUSES)[number];

/** Statuses a rep may set on their own (not clinic-linked) log entries. */
export const PERSONAL_VISIT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

/** A booked visit still waiting on, or approved by, the clinic. */
export const ACTIVE_CLINIC_STATUSES: readonly RepVisitStatus[] = ['requested', 'scheduled'];

export const REP_VISIT_STATUS_LABEL: Record<RepVisitStatus, string> = {
  requested: 'Requested',
  scheduled: 'Approved',
  declined: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
};

/** What clinic staff may do to a booked visit, by its current status. */
export const CLINIC_ACTIONS = {
  approve: ['requested'],
  decline: ['requested'],
  'check-in': ['scheduled'],
  complete: ['scheduled'],
  'no-show': ['scheduled'],
  cancel: ['scheduled'],
} as const satisfies Record<string, readonly RepVisitStatus[]>;
export type ClinicAction = keyof typeof CLINIC_ACTIONS;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const repVisitWindowSchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday. */
    dayOfWeek: z.number().int().min(0).max(6),
    start: z.string().regex(HHMM, 'Use HH:mm'),
    end: z.string().regex(HHMM, 'Use HH:mm'),
    /** Reps the clinic will see per slot. */
    maxReps: z.number().int().min(1).max(20),
  })
  .refine((w) => toMinutes(w.end) > toMinutes(w.start), { message: 'The window must end after it starts', path: ['end'] });
export type RepVisitWindow = z.infer<typeof repVisitWindowSchema>;

export const repVisitSettingsSchema = z
  .object({
    /** Reps can book visits with this clinic from the app. */
    enabled: z.boolean(),
    /** Any activated rep can find the clinic and ask for a visit, not only reps the clinic has added. */
    openToAllReps: z.boolean(),
    slotMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]),
    /** How far ahead reps may book. */
    maxAdvanceDays: z.number().int().min(1).max(90),
    windows: z.array(repVisitWindowSchema).max(28),
    /** Shown to reps when they book: where to go, what to bring. */
    instructions: z.string().trim().max(1000),
  })
  .strict();
export type RepVisitSettings = z.infer<typeof repVisitSettingsSchema>;

export const DEFAULT_REP_VISIT_SETTINGS: RepVisitSettings = {
  enabled: false,
  openToAllReps: false,
  slotMinutes: 15,
  maxAdvanceDays: 30,
  windows: [],
  instructions: '',
};

/** Stored settings, with defaults for anything missing or invalid. */
export function normalizeRepVisitSettings(raw: unknown): RepVisitSettings {
  const merged = { ...DEFAULT_REP_VISIT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const parsed = repVisitSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_REP_VISIT_SETTINGS;
}

/** "YYYY-MM-DD" → the visit's stored date (UTC midnight of that day), or null. */
export function parseVisitDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day ? null : d;
}

/** Today's date ("YYYY-MM-DD") and time ("HH:mm") in a timezone. */
export function localNow(timeZone: string, now: Date = new Date()): { day: string; time: string } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'Asia/Manila';
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export interface RepVisitSlot {
  time: string;
  /** Approved visits the slot can still take. */
  remaining: number;
}

/**
 * The slots a clinic offers reps on a day, with what is left in each. `booked` counts approved
 * visits by start time. Past slots (today, in the clinic's timezone) and days beyond the booking
 * horizon have none.
 */
export function slotsForDay(
  settings: RepVisitSettings,
  day: string,
  booked: Record<string, number>,
  today: { day: string; time: string }
): RepVisitSlot[] {
  const date = parseVisitDay(day);
  const todayDate = parseVisitDay(today.day);
  if (!settings.enabled || !date || !todayDate) return [];
  const daysAhead = Math.round((date.getTime() - todayDate.getTime()) / 86_400_000);
  if (daysAhead < 0 || daysAhead > settings.maxAdvanceDays) return [];

  const slots = new Map<string, number>();
  for (const w of settings.windows) {
    if (w.dayOfWeek !== date.getUTCDay()) continue;
    for (let m = toMinutes(w.start); m + settings.slotMinutes <= toMinutes(w.end); m += settings.slotMinutes) {
      const time = fromMinutes(m);
      if (daysAhead === 0 && time <= today.time) continue;
      slots.set(time, Math.max(slots.get(time) ?? 0, w.maxReps));
    }
  }
  return [...slots.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, max]) => ({ time, remaining: Math.max(0, max - (booked[time] ?? 0)) }));
}

/** The clinic's visiting hours in one line per day, for the rep app's clinic list. */
export function describeWindows(windows: RepVisitWindow[]): string[] {
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [...windows]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start.localeCompare(b.start))
    .map((w) => `${DAY[w.dayOfWeek]} ${w.start}–${w.end}`);
}
