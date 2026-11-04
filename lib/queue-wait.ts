import 'server-only';
import type { Types } from 'mongoose';
import Queue from '@/models/Queue';

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
    { $match: { tenantId, status: 'completed', startedAt: { $gte: todayStart }, completedAt: { $ne: null } } },
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
