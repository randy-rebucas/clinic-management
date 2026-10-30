/**
 * Visit fields the patient API never returns: the provider's signature image, staff notes,
 * the feedback link token and reminder bookkeeping.
 */
export const PATIENT_VISIT_EXCLUDE =
  '-digitalSignature.signatureData -notes -feedbackToken -feedbackRequested -followUpReminderSent -followUpReminderClaimedAt';
