/**
 * Visit fields the patient API never returns: the provider's signature image, staff notes,
 * the feedback link token, reminder bookkeeping, and attachment file contents/locations
 * (`url` may be an inline data URL or a storage URL; `gridFsId` locates the stored file) plus
 * staff-only attachment details. Attachment metadata (filename, contentType, size, uploadDate)
 * stays so a client can list what is attached.
 */
export const PATIENT_VISIT_EXCLUDE =
  '-digitalSignature.signatureData -notes -feedbackToken -feedbackRequested -followUpReminderSent -followUpReminderClaimedAt' +
  ' -attachments.url -attachments.gridFsId -attachments.notes -attachments.uploadedBy';

/**
 * Visits a patient may see: drafts are a clinician's work in progress and stay hidden until
 * opened/closed. Spread into every patient-facing Visit query.
 */
export const PATIENT_VISIT_VISIBLE = { status: { $ne: 'draft' } } as const;
