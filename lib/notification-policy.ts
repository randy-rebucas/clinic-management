import type { NotificationPriority } from '@/models/Notification';

/**
 * Whether a push should interrupt someone right now. Only the interruption is held: the
 * notification itself is still written, so it waits in the person's feed.
 *
 *  - Quiet hours are priority-only: high and urgent still come through.
 *  - A pause holds everything but urgent.
 *  - Urgent is never held. A clinic can't let a setting silence one.
 *
 * Anything unknown (no preferences, a bad timezone) delivers: a missed clinical alert costs
 * more than an unwanted one.
 */

export interface QuietHours {
  enabled: boolean;
  /** 24-hour "HH:mm" in `timezone`. A start after the end runs past midnight. */
  start: string;
  end: string;
  /** IANA name, e.g. "Asia/Manila". */
  timezone: string;
}

export interface DeliveryPreferences {
  pausedUntil?: Date | null;
  quietHours?: QuietHours | null;
}

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The longest a pause may run, so nobody silences themselves and forgets. */
export const MAX_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function minutesInTimezone(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return value('hour') * 60 + value('minute');
}

/** True from `start` up to, but not including, `end`. */
export function isWithinQuietHours(quietHours: QuietHours | null | undefined, now: Date): boolean {
  if (!quietHours?.enabled) return false;
  if (!TIME_OF_DAY.test(quietHours.start) || !TIME_OF_DAY.test(quietHours.end)) return false;

  let current: number;
  try {
    current = minutesInTimezone(now, quietHours.timezone);
  } catch {
    return false;
  }
  const start = minutesOf(quietHours.start);
  const end = minutesOf(quietHours.end);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function shouldDeliverPush(
  preferences: DeliveryPreferences | null | undefined,
  priority: NotificationPriority = 'normal',
  now: Date = new Date()
): boolean {
  if (priority === 'urgent' || !preferences) return true;
  if (preferences.pausedUntil && new Date(preferences.pausedUntil).getTime() > now.getTime()) return false;
  if (priority === 'high') return true;
  return !isWithinQuietHours(preferences.quietHours, now);
}
