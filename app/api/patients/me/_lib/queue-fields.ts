/**
 * What the patient app reads of its queue entry (eMCR `QueueEntry`). A whitelist: staff notes,
 * priority, vitals, completion notes and next action stay with the clinic.
 */
export const PATIENT_QUEUE_FIELDS = [
  '_id', 'tenantId', 'queueNumber', 'queueType', 'status', 'awayReason', 'checkedIn', 'qrCode',
  'queuedAt', 'estimatedWaitTime', 'doctor', 'room',
] as const;

export function toPatientQueueEntry(entry: Record<string, unknown>, position: number | null) {
  const view: Record<string, unknown> = {};
  for (const field of PATIENT_QUEUE_FIELDS) if (entry[field] !== undefined) view[field] = entry[field];
  return { ...view, position };
}
