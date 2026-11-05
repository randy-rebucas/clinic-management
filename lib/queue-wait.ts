import 'server-only';
import type { AnyBulkWriteOperation, Types } from 'mongoose';
import Queue from '@/models/Queue';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { QUEUE_SORT } from '@/lib/queue-order';
import { dayRangeInTz } from '@/lib/tz';

/** Upper bound on live entries read per refresh (one clinic's day). */
const MAX_SCAN = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

interface LineEntry {
  status: string;
  doctor?: { _id?: unknown } | null;
}

export interface WaitEstimate {
  position: number;
  estimatedWaitTime: number;
  consultMinutes: number;
}

const lineKey = (e: LineEntry) => String(e.doctor?._id ?? 'none');

/** Each doctor's average consultation today, once they have seen at least two patients. */
export async function consultMinutesByDoctor(tenantId: Types.ObjectId, todayStart: Date): Promise<Map<string, number>> {
  const consults = await Queue.aggregate([
    {
      $match: {
        tenantId,
        status: 'completed',
        // priority and queuedAt carry the index (tenantId, status, priority, queuedAt) down to recent
        // entries; on startedAt alone this reads every completed entry the clinic has ever had.
        // A day back covers a patient who joined last night and was seen this morning.
        priority: { $gte: 0 },
        queuedAt: { $gte: new Date(todayStart.getTime() - DAY_MS) },
        startedAt: { $gte: todayStart },
        completedAt: { $ne: null },
      },
    },
    { $group: { _id: '$doctor', avg: { $avg: { $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 60_000] } }, n: { $sum: 1 } } },
  ]);
  return new Map(
    consults.filter((c: { n: number }) => c.n >= 2).map((c: { _id: unknown; avg: number }) => [String(c._id ?? 'none'), Math.max(5, c.avg)])
  );
}

/**
 * Each doctor runs their own line (unassigned patients share one). Position counts the waiting
 * patients ahead in that line; the estimate uses the doctor's average consultation today, else
 * the clinic's default appointment length. Expects entries in call order.
 */
export function estimateWaits<T extends LineEntry>(entries: T[], avgByDoctor: Map<string, number>, fallbackMinutes: number): Map<T, WaitEstimate> {
  const busy = new Set(entries.filter((e) => e.status === 'in-progress').map(lineKey));
  const seen = new Map<string, number>();
  const estimates = new Map<T, WaitEstimate>();
  for (const entry of entries) {
    if (entry.status !== 'waiting') continue;
    const key = lineKey(entry);
    const ahead = seen.get(key) ?? 0;
    seen.set(key, ahead + 1);
    const avg = avgByDoctor.get(key) ?? fallbackMinutes;
    const minutes = ahead * avg + (busy.has(key) ? avg / 2 : 0);
    estimates.set(entry, { position: ahead + 1, estimatedWaitTime: Math.round(minutes / 5) * 5, consultMinutes: Math.round(avg) });
  }
  return estimates;
}

/**
 * Saves each waiting patient's estimate for the patient app and SMS, which read it from the entry.
 * The staff page and TV work theirs out on load. Run after any change to the line, and safe to
 * repeat: only values that moved are written. Never throws.
 */
export async function refreshQueueWaits(tenantId: Types.ObjectId): Promise<void> {
  try {
    const [entries, settings, timeZone] = await Promise.all([
      Queue.find({ tenantId, status: { $in: ['waiting', 'in-progress', 'away'] } })
        .select('status doctor estimatedWaitTime')
        .sort(QUEUE_SORT)
        .limit(MAX_SCAN)
        .lean<(LineEntry & { _id: Types.ObjectId; estimatedWaitTime?: number })[]>(),
      getSettings(String(tenantId)),
      getTenantTimezone(tenantId),
    ]);
    const { start: todayStart } = dayRangeInTz(new Date(), timeZone);
    const estimates = estimateWaits(entries, await consultMinutesByDoctor(tenantId, todayStart), settings?.appointmentSettings?.defaultDuration || 15);

    const writes = entries.flatMap((entry): AnyBulkWriteOperation[] => {
      // Out of the line, so no estimate to show; they get a fresh one when they come back.
      if (entry.status === 'away' && entry.estimatedWaitTime != null) {
        return [{ updateOne: { filter: { _id: entry._id, tenantId, status: 'away' }, update: { $unset: { estimatedWaitTime: 1 } } } }];
      }
      const minutes = estimates.get(entry)?.estimatedWaitTime;
      if (minutes === undefined || minutes === entry.estimatedWaitTime) return [];
      return [{ updateOne: { filter: { _id: entry._id, tenantId, status: 'waiting' }, update: { $set: { estimatedWaitTime: minutes } } } }];
    });
    if (writes.length) await Queue.bulkWrite(writes);
  } catch (error) {
    console.error('[queue-wait] Error refreshing wait estimates:', error);
  }
}
