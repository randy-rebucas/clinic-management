import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REP_VISIT_SETTINGS,
  describeWindows,
  localNow,
  normalizeRepVisitSettings,
  parseVisitDay,
  repVisitSettingsSchema,
  slotsForDay,
  type RepVisitSettings,
} from '@/lib/rep-visit-rules';

// 2026-11-03 is a Tuesday.
const SETTINGS: RepVisitSettings = {
  ...DEFAULT_REP_VISIT_SETTINGS,
  enabled: true,
  slotMinutes: 30,
  maxAdvanceDays: 14,
  windows: [{ dayOfWeek: 2, start: '15:00', end: '17:00', maxReps: 2 }],
};
const MONDAY = { day: '2026-11-02', time: '09:00' };

describe('parseVisitDay', () => {
  it('reads YYYY-MM-DD as UTC midnight and rejects anything else', () => {
    expect(parseVisitDay('2026-11-03')?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(parseVisitDay('2026-02-30')).toBeNull();
    expect(parseVisitDay('2026-11-03T10:00:00Z')).toBeNull();
    expect(parseVisitDay('')).toBeNull();
  });
});

describe('localNow', () => {
  it('gives the date and time in the clinic timezone', () => {
    // 17:30 UTC on Nov 2 is 01:30 on Nov 3 in Manila (UTC+8).
    expect(localNow('Asia/Manila', new Date('2026-11-02T17:30:00Z'))).toEqual({ day: '2026-11-03', time: '01:30' });
  });

  it('falls back to Manila for an unknown timezone', () => {
    expect(localNow('Not/AZone', new Date('2026-11-02T17:30:00Z'))).toEqual({ day: '2026-11-03', time: '01:30' });
  });
});

describe('slotsForDay', () => {
  it('cuts the window into slots with what each has left', () => {
    expect(slotsForDay(SETTINGS, '2026-11-03', { '15:30': 1, '16:00': 2 }, MONDAY)).toEqual([
      { time: '15:00', remaining: 2 },
      { time: '15:30', remaining: 1 },
      { time: '16:00', remaining: 0 },
      { time: '16:30', remaining: 2 },
    ]);
  });

  it('has nothing on other weekdays, past days, beyond the horizon or when off', () => {
    expect(slotsForDay(SETTINGS, '2026-11-04', {}, MONDAY)).toEqual([]);
    expect(slotsForDay(SETTINGS, '2026-10-27', {}, MONDAY)).toEqual([]);
    expect(slotsForDay(SETTINGS, '2026-11-24', {}, MONDAY)).toEqual([]);
    expect(slotsForDay({ ...SETTINGS, enabled: false }, '2026-11-03', {}, MONDAY)).toEqual([]);
  });

  it('drops slots that have started today', () => {
    expect(slotsForDay(SETTINGS, '2026-11-03', {}, { day: '2026-11-03', time: '15:30' }).map((s) => s.time)).toEqual(['16:00', '16:30']);
  });

  it('does not offer a slot that would run past the window', () => {
    const odd = { ...SETTINGS, windows: [{ dayOfWeek: 2, start: '15:00', end: '15:45', maxReps: 1 }] };
    expect(slotsForDay(odd, '2026-11-03', {}, MONDAY).map((s) => s.time)).toEqual(['15:00']);
  });

  it('takes the larger capacity where windows overlap', () => {
    const overlap = { ...SETTINGS, windows: [...SETTINGS.windows, { dayOfWeek: 2, start: '16:00', end: '17:00', maxReps: 5 }] };
    expect(slotsForDay(overlap, '2026-11-03', {}, MONDAY).find((s) => s.time === '16:00')?.remaining).toBe(5);
  });
});

describe('settings', () => {
  it('fills in defaults for missing or broken stored settings', () => {
    expect(normalizeRepVisitSettings(undefined)).toEqual(DEFAULT_REP_VISIT_SETTINGS);
    expect(normalizeRepVisitSettings({ enabled: 'yes' })).toEqual(DEFAULT_REP_VISIT_SETTINGS);
    expect(normalizeRepVisitSettings({ enabled: true, windows: SETTINGS.windows }).enabled).toBe(true);
  });

  it('rejects a window that ends before it starts', () => {
    const bad = { ...SETTINGS, windows: [{ dayOfWeek: 2, start: '17:00', end: '15:00', maxReps: 1 }] };
    expect(repVisitSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('describes windows day by day', () => {
    expect(describeWindows([{ dayOfWeek: 4, start: '09:00', end: '10:00', maxReps: 1 }, ...SETTINGS.windows])).toEqual([
      'Tue 15:00–17:00',
      'Thu 09:00–10:00',
    ]);
  });
});
