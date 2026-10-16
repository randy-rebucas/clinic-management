import { describe, it, expect } from 'vitest';
import {
  dayRangeInTz,
  dayRangeOffsetInTz,
  combineDateAndTimeInTz,
  previousWeekRangeInTz,
  previousMonthRangeInTz,
  hourInTz,
  formatInTz,
  resolveTimezone,
} from '@/lib/tz';

const MANILA = 'Asia/Manila';

describe('tz helpers (Asia/Manila, UTC+8)', () => {
  it('dayRangeInTz uses the clinic-local day, not the UTC day', () => {
    // 20:00Z on Oct 15 is already 04:00 on Oct 16 in Manila
    const { start, end } = dayRangeInTz('2026-10-15T20:00:00Z', MANILA);
    expect(start.toISOString()).toBe('2026-10-15T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-16T15:59:59.999Z');
  });

  it('dayRangeOffsetInTz shifts by whole clinic days', () => {
    const { start, end } = dayRangeOffsetInTz(1, '2026-10-15T20:00:00Z', MANILA);
    expect(start.toISOString()).toBe('2026-10-16T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-17T15:59:59.999Z');
  });

  it('combineDateAndTimeInTz builds the real instant for a local date and time', () => {
    expect(combineDateAndTimeInTz('2026-10-16', '09:00', MANILA).toISOString()).toBe('2026-10-16T01:00:00.000Z');
    expect(combineDateAndTimeInTz('2026-10-16', null, MANILA).toISOString()).toBe('2026-10-15T16:00:00.000Z');
    // A Date argument uses its Manila calendar day
    expect(combineDateAndTimeInTz(new Date('2026-10-15T20:00:00Z'), '09:00', MANILA).toISOString()).toBe(
      '2026-10-16T01:00:00.000Z'
    );
  });

  it('previousWeekRangeInTz returns the previous Monday–Sunday in Manila', () => {
    // Friday 2026-10-16 (Manila) -> Mon Oct 5 .. Sun Oct 11
    const { start, end } = previousWeekRangeInTz('2026-10-16T02:00:00Z', MANILA);
    expect(start.toISOString()).toBe('2026-10-04T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-11T15:59:59.999Z');
  });

  it('previousMonthRangeInTz returns the previous calendar month in Manila', () => {
    // 2026-09-30T17:00Z is Oct 1 01:00 in Manila, so the previous month is September
    const { start, end } = previousMonthRangeInTz('2026-09-30T17:00:00Z', MANILA);
    expect(start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T15:59:59.999Z');
  });

  it('hourInTz and formatInTz read the local wall clock', () => {
    expect(hourInTz('2026-10-15T20:00:00Z', MANILA)).toBe(4);
    expect(formatInTz('2026-10-15T20:00:00Z', 'yyyy-MM-dd', MANILA)).toBe('2026-10-16');
  });

  it('resolveTimezone falls back to Manila for missing, UTC or invalid zones', () => {
    expect(resolveTimezone(undefined)).toBe(MANILA);
    expect(resolveTimezone('UTC')).toBe(MANILA);
    expect(resolveTimezone('Not/AZone')).toBe(MANILA);
    expect(resolveTimezone('Asia/Singapore')).toBe('Asia/Singapore');
  });
});
