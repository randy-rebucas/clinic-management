/**
 * Queue order, in one place. Priority is "higher = called sooner": 0 normal, 1 high,
 * 2 urgent (the values the queue form has always stored). Ties go to whoever arrived first.
 */
export const QUEUE_PRIORITY = { normal: 0, high: 1, urgent: 2 } as const;

export const QUEUE_SORT = { priority: -1, queuedAt: 1 } as const;

/** Mongo filter for the entries ahead of `entry` in its line (combine with tenant/status/doctor). */
export function aheadOf(entry: { priority?: number | null; queuedAt: Date | string }) {
  const p = entry.priority ?? 0;
  const at = new Date(entry.queuedAt);
  return { $or: [{ priority: { $gt: p } }, { priority: p, queuedAt: { $lt: at } }] };
}
