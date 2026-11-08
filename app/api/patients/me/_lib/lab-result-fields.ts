/**
 * LabResult fields never sent to patients: the third-party lab integration block (endpoint,
 * API key, external ids, error messages) and attachment file contents (inline data URLs).
 * The staff detail route strips the same (`app/api/lab-results/[id]/route.ts`).
 */
export const PATIENT_LAB_RESULT_HIDDEN = '-thirdPartyLab -attachments.url';

/**
 * Lab results a patient may see. Results completed by lab staff carry `awaitingReview: true`
 * until a clinician reviews them (the flag is `$unset` on review, `app/api/lab-results/[id]`),
 * so the patient learns of them only after review. Spread into every patient-facing query.
 */
export const PATIENT_LAB_RESULT_VISIBLE = { awaitingReview: { $ne: true } } as const;
