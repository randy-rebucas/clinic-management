/**
 * LabResult fields never sent to patients: the third-party lab integration block (endpoint,
 * API key, external ids, error messages), attachment file contents and locations (inline data
 * URLs, GridFS ids) and staff-only attachment details, which staff member ordered, received,
 * performed or reviewed the test (eMCR shows none of them), and result-notice bookkeeping.
 * The staff detail route strips the first two too (`app/api/lab-results/[id]/route.ts`).
 */
export const PATIENT_LAB_RESULT_HIDDEN = [
  'thirdPartyLab',
  'attachments.url',
  'attachments.gridFsId',
  'attachments.uploadedBy',
  'attachments.notes',
  'orderedBy',
  'receivedBy',
  'performedBy',
  'reviewedBy',
  'resultsInNoticeAt',
  'notificationSent',
  'notificationClaimedAt',
  'notificationSentAt',
  'notificationMethod',
  'notificationAttempts',
  'notificationFailedAt',
]
  .map((f) => `-${f}`)
  .join(' ');

/** Values are final once the lab completed the request (or a clinician reviewed it). */
const READY_STATUSES = new Set(['completed', 'reviewed']);

/**
 * The patient view of one lab result (lean, selected with PATIENT_LAB_RESULT_HIDDEN): values and
 * flags entered while the request is still in progress are withheld until it is completed, so a
 * half-entered panel never reaches the patient (eMCR hides them too, lib/labResults.ts isReady()).
 */
export function toPatientLabResult<T extends Record<string, unknown>>(labResult: T): T {
  if (READY_STATUSES.has(String(labResult.status ?? ''))) return labResult;
  return { ...labResult, results: null, abnormalFlags: null };
}

/**
 * Lab results a patient may see. Results completed by lab staff carry `awaitingReview: true`
 * until a clinician reviews them (the flag is `$unset` on review, `app/api/lab-results/[id]`),
 * so the patient learns of them only after review. Spread into every patient-facing query.
 */
export const PATIENT_LAB_RESULT_VISIBLE = { awaitingReview: { $ne: true } } as const;
