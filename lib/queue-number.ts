import { Types } from 'mongoose';
import Queue from '@/models/Queue';
import { nextSequence, maxCodeSeed } from '@/lib/counters';
import { formatInTz } from '@/lib/tz';

export type QueueType = 'appointment' | 'walk-in' | 'follow-up';

export function queuePrefix(queueType: string | undefined): string {
  return queueType === 'appointment' ? 'A' : queueType === 'walk-in' ? 'W' : 'F';
}

/**
 * Next queue number for a clinic, e.g. "A20261016-007". Counted per tenant, per queue type
 * and per clinic-local day (counter key `queue:<prefix>:<yyyy-MM-dd>`), seeded from numbers
 * already issued today so it continues after the switch to counters.
 */
export async function nextQueueNumber(
  tenantId: string | Types.ObjectId,
  queueType: string | undefined,
  tz: string,
  at: Date = new Date()
): Promise<string> {
  const tid = new Types.ObjectId(String(tenantId));
  const prefix = queuePrefix(queueType);
  const ymd = formatInTz(at, 'yyyy-MM-dd', tz);
  const stem = `${prefix}${ymd.replace(/-/g, '')}-`;
  const seq = await nextSequence(
    tid,
    `queue:${prefix}:${ymd}`,
    maxCodeSeed(Queue, 'queueNumber', { tenantId: tid, queueNumber: { $regex: `^${stem}\\d+$` } })
  );
  return `${stem}${String(seq).padStart(3, '0')}`;
}
