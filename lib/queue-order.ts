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

/** "W20261016-003" → "W-003", the number people read and say; the date only keeps it unique. */
export function shortQueueNumber(n: string): string {
  const m = /^([A-Z]+)\d{8}-(\d+)$/.exec(n || '');
  return m ? `${m[1]}-${m[2]}` : n;
}

const doctorIdOf = (doctor: unknown) => (doctor ? String((doctor as { _id?: unknown })._id ?? doctor) : null);

interface ConsultEntry {
  _id: unknown;
  doctor?: unknown;
}

/**
 * Why `entry` can't go in to consult now, or null if it can. Each line sees one patient at a time:
 * a line is a doctor, and unassigned patients share one. Unassigned patients still take up a doctor,
 * so the clinic never has more people in consult than active doctors. `inConsult` is every
 * in-progress entry in the clinic.
 */
export function consultBlocker(
  entry: ConsultEntry,
  inConsult: (ConsultEntry & { patientName?: string; queueNumber: string })[],
  doctorCount: number
): string | null {
  const others = inConsult.filter((e) => String(e._id) !== String(entry._id));
  const doctorId = doctorIdOf(entry.doctor);
  const sameLine = others.find((e) => doctorIdOf(e.doctor) === doctorId);
  if (sameLine) {
    return `${sameLine.patientName || 'Another patient'} (${shortQueueNumber(sameLine.queueNumber)}) is still in consult${doctorId ? ' with this doctor' : ''}. Mark them as seen before calling the next patient.`;
  }
  if (others.length >= Math.max(doctorCount, 1)) {
    return 'No doctor is free right now. Mark the patient in consult as seen before calling the next one.';
  }
  return null;
}
