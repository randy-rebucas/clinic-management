import { Types } from 'mongoose';
import Queue from '@/models/Queue';
import { aheadOf } from '@/lib/queue-order';

/**
 * A patient's place in line, counted the way the staff queue screen counts it
 * (app/api/queue/route.ts): each doctor runs their own line, unassigned patients share one,
 * and position = waiting patients ahead in that line + 1.
 */

type LineEntry = { doctor?: unknown; priority?: number | null; queuedAt: Date | string };

/** Mongo filter for the entry's line: same doctor, or no doctor (`null` also matches a missing field). */
export function lineFilter(entry: { doctor?: unknown }): Record<string, unknown> {
  const doctor = entry.doctor && typeof entry.doctor === 'object' && '_id' in entry.doctor ? (entry.doctor as { _id: unknown })._id : entry.doctor;
  return { doctor: doctor ?? null };
}

/** 1 = next in line. Only meaningful for an entry that is still waiting. */
export async function queuePosition(tenantId: Types.ObjectId | string, entry: LineEntry): Promise<number> {
  const ahead = await Queue.countDocuments({
    tenantId: new Types.ObjectId(String(tenantId)),
    status: 'waiting',
    ...lineFilter(entry),
    ...aheadOf(entry),
  });
  return ahead + 1;
}

/** "next", "2nd", "3rd", "4th", … for notification copy. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
