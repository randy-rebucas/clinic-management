/** Lab-result definitions shared by the list API and its insights. */

export const LAB_STATUSES = ['ordered', 'in-progress', 'completed', 'reviewed', 'cancelled'] as const;
export const OUTSTANDING = ['ordered', 'in-progress'];

/** Laboratory staff: they receive the requests and enter the results. */
export const LAB_ROLE = 'medical-technologist';
export const isLabRole = (role?: string | null) => role === LAB_ROLE;

/** Marking a result reviewed is a clinician's sign-off, never the lab's own. */
export const canReviewLabs = (role?: string | null) => !isLabRole(role);

/** What lab staff may change on a request: its progress and results, not the order itself. */
export const LAB_STAFF_FIELDS = new Set(['status', 'results', 'resultDate', 'interpretation', 'referenceRanges', 'abnormalFlags', 'thirdPartyLab']);

/**
 * Where lab staff may move a request from each status: forward only (receive it, complete it).
 * Cancelling, reopening and anything after review stay with the clinicians.
 */
export const LAB_STAFF_TRANSITIONS: Record<string, string[]> = {
  ordered: ['ordered', 'in-progress', 'completed'],
  'in-progress': ['in-progress', 'completed'],
  completed: ['completed'],
};

/** Fields that change what a result says; editing them after review undoes the review. */
export const RESULT_FIELDS = ['results', 'resultDate', 'interpretation', 'referenceRanges', 'abnormalFlags'];

/** Mongo `$expr` that is true when any value in `abnormalFlags` is high or low. */
export const HAS_ABNORMAL_EXPR = {
  $gt: [
    {
      $size: {
        $filter: {
          input: { $objectToArray: { $ifNull: ['$abnormalFlags', {}] } },
          cond: { $in: ['$$this.v', ['high', 'low']] },
        },
      },
    },
    0,
  ],
};

/** How long an unfinished order has been waiting, in whole days since it was ordered. */
export const WAIT_BUCKETS = [
  { key: '0-1', label: 'Today or yesterday', short: '0–1 d', min: 0, max: 1 },
  { key: '2-3', label: '2–3 days', short: '2–3 d', min: 2, max: 3 },
  { key: '4-7', label: '4–7 days', short: '4–7 d', min: 4, max: 7 },
  { key: '8+', label: '8 days or more', short: '8+ d', min: 8, max: null },
] as const;

export type WaitBucketKey = (typeof WAIT_BUCKETS)[number]['key'];

/** orderDate range for a waiting bucket, counted back from `now` in whole days. */
export function waitRange(key: string, now: Date = new Date()) {
  const b = WAIT_BUCKETS.find((x) => x.key === key);
  if (!b) return null;
  const day = 86_400_000;
  const range: { $lte?: Date; $gt?: Date } = { $lte: new Date(now.getTime() - b.min * day) };
  if (b.max !== null) range.$gt = new Date(now.getTime() - (b.max + 1) * day);
  return range;
}
