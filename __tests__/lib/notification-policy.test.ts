import { describe, it, expect } from 'vitest';
import { isWithinQuietHours, shouldDeliverPush, type QuietHours } from '@/lib/notification-policy';

const NIGHT: QuietHours = { enabled: true, start: '22:00', end: '07:00', timezone: 'Asia/Manila' };
const LUNCH: QuietHours = { enabled: true, start: '12:00', end: '13:00', timezone: 'Asia/Manila' };

// Manila is UTC+8.
const at = (manilaTime: string, day = '2026-11-06') => new Date(`${day}T${manilaTime}:00+08:00`);

describe('isWithinQuietHours', () => {
  it('handles a window that runs past midnight', () => {
    expect(isWithinQuietHours(NIGHT, at('23:30'))).toBe(true);
    expect(isWithinQuietHours(NIGHT, at('00:00'))).toBe(true);
    expect(isWithinQuietHours(NIGHT, at('06:59'))).toBe(true);
    expect(isWithinQuietHours(NIGHT, at('12:00'))).toBe(false);
  });

  it('handles a window within one day', () => {
    expect(isWithinQuietHours(LUNCH, at('12:30'))).toBe(true);
    expect(isWithinQuietHours(LUNCH, at('11:59'))).toBe(false);
    expect(isWithinQuietHours(LUNCH, at('13:30'))).toBe(false);
  });

  it('includes the start and excludes the end', () => {
    expect(isWithinQuietHours(NIGHT, at('22:00'))).toBe(true);
    expect(isWithinQuietHours(NIGHT, at('07:00'))).toBe(false);
  });

  it('reads the clock in the person’s timezone, not the server’s', () => {
    const moment = new Date('2026-11-06T15:00:00Z'); // 23:00 in Manila, 10:00 in New York
    expect(isWithinQuietHours(NIGHT, moment)).toBe(true);
    expect(isWithinQuietHours({ ...NIGHT, timezone: 'America/New_York' }, moment)).toBe(false);
  });

  it('is off when disabled, missing, or impossible to evaluate', () => {
    expect(isWithinQuietHours({ ...NIGHT, enabled: false }, at('23:00'))).toBe(false);
    expect(isWithinQuietHours(null, at('23:00'))).toBe(false);
    expect(isWithinQuietHours({ ...NIGHT, timezone: 'Not/AZone' }, at('23:00'))).toBe(false);
    expect(isWithinQuietHours({ ...NIGHT, start: '25:00' }, at('23:00'))).toBe(false);
    expect(isWithinQuietHours({ ...NIGHT, end: '22:00' }, at('22:00'))).toBe(false);
  });
});

describe('shouldDeliverPush', () => {
  const night = at('23:00');

  it('delivers when there are no preferences', () => {
    expect(shouldDeliverPush(null, 'low', night)).toBe(true);
    expect(shouldDeliverPush(undefined, 'normal', night)).toBe(true);
  });

  it('treats a missing priority as normal', () => {
    expect(shouldDeliverPush({ quietHours: NIGHT }, undefined, night)).toBe(false);
  });

  it('during quiet hours holds low and normal, and lets high and urgent through', () => {
    const prefs = { quietHours: NIGHT };
    expect(shouldDeliverPush(prefs, 'low', night)).toBe(false);
    expect(shouldDeliverPush(prefs, 'normal', night)).toBe(false);
    expect(shouldDeliverPush(prefs, 'high', night)).toBe(true);
    expect(shouldDeliverPush(prefs, 'urgent', night)).toBe(true);
  });

  it('during a pause holds everything but urgent', () => {
    const prefs = { pausedUntil: new Date(night.getTime() + 60_000) };
    expect(shouldDeliverPush(prefs, 'normal', night)).toBe(false);
    expect(shouldDeliverPush(prefs, 'high', night)).toBe(false);
    expect(shouldDeliverPush(prefs, 'urgent', night)).toBe(true);
  });

  it('ignores a pause that has ended', () => {
    expect(shouldDeliverPush({ pausedUntil: new Date(night.getTime() - 1) }, 'normal', night)).toBe(true);
    expect(shouldDeliverPush({ pausedUntil: night }, 'normal', night)).toBe(true);
  });

  it('delivers outside quiet hours', () => {
    expect(shouldDeliverPush({ quietHours: NIGHT }, 'low', at('12:00'))).toBe(true);
  });
});
