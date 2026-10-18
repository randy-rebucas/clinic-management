/**
 * LabResult fields never sent to patients: the third-party lab integration block (endpoint,
 * API key, external ids, error messages) and attachment file contents (inline data URLs).
 * The staff detail route strips the same (`app/api/lab-results/[id]/route.ts`).
 */
export const PATIENT_LAB_RESULT_HIDDEN = '-thirdPartyLab -attachments.url';
