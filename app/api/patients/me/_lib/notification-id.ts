/**
 * Ids for the patient's derived notification feed (`GET /api/patients/me/notifications`).
 *
 * The id carries the record's status (`apt-<id>-<status>`), so a status change (pending →
 * confirmed → cancelled, completed → reviewed, unpaid → partial) is a new, unread notification
 * instead of inheriting the read flag of the old one. Prescriptions only notify once ("new
 * prescription"), so their id has no status part.
 *
 * Ids stored before statuses were included (`apt-<id>`) simply never match a current id; the
 * PATCH handler prunes them from the patient's read list.
 */
export type NotificationKind = 'apt' | 'lab' | 'inv' | 'rx';

export function notificationId(kind: NotificationKind, recordId: unknown, status?: string | null): string {
  const base = `${kind}-${String(recordId)}`;
  if (kind === 'rx' || !status) return base;
  // Statuses are enum values; keep the id URL- and storage-safe regardless.
  return `${base}-${String(status).replace(/[^a-z0-9_-]/gi, '')}`;
}
