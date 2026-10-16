/**
 * Referral definitions shared by the API and the referral screens (no server imports).
 *
 * The record keeps three `type`s; the screens speak in four directions derived from them, so
 * nothing stored changes:
 *   internal  doctor_to_doctor: one of our doctors to another of ours
 *   out       external with one of our doctors as the sender (or only a receiving clinic):
 *             sent to an outside clinic, hospital or specialist
 *   in        external from an outside clinic or contact: came to us
 *   patient   patient_to_patient: recommended by one of our patients
 */

export const REFERRAL_STATUSES = ['pending', 'accepted', 'completed', 'declined', 'cancelled'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const OPEN_STATUSES: ReferralStatus[] = ['pending', 'accepted'];

export const URGENCIES = ['routine', 'urgent', 'stat'] as const;
export type ReferralUrgency = (typeof URGENCIES)[number];

/** Where a referral may go next. Seen, declined and cancelled are final. */
export const NEXT_STATUS: Record<ReferralStatus, ReferralStatus[]> = {
  pending: ['accepted', 'completed', 'declined', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  declined: [],
  cancelled: [],
};

export const DIRECTIONS = ['internal', 'out', 'in', 'patient'] as const;
export type ReferralDirection = (typeof DIRECTIONS)[number];

export const DIRECTION_LABEL: Record<ReferralDirection, { label: string; short: string }> = {
  internal: { label: 'To a doctor here', short: 'Within the clinic' },
  out: { label: 'To another clinic or specialist', short: 'Sent out' },
  in: { label: 'From another clinic', short: 'Came in' },
  patient: { label: 'Recommended by a patient', short: 'From a patient' },
};

interface DirectionFields {
  type?: string;
  referringDoctor?: unknown;
  referringClinic?: string | null;
  referringContact?: { name?: string | null } | null;
  receivingClinic?: string | null;
}

const filled = (v?: string | null) => typeof v === 'string' && v.trim() !== '';

export function directionOf(r: DirectionFields): ReferralDirection {
  if (r.type === 'doctor_to_doctor') return 'internal';
  if (r.type === 'patient_to_patient') return 'patient';
  if (r.referringDoctor) return 'out';
  if (filled(r.receivingClinic) && !filled(r.referringClinic) && !filled(r.referringContact?.name)) return 'out';
  return 'in';
}

const BLANK = { $in: [null, ''] };
const PRESENT = { $nin: [null, ''] };

/** Mongo filter matching `directionOf` (keep the two in step). */
export function directionFilter(direction: string): Record<string, unknown> | null {
  switch (direction) {
    case 'internal':
      return { type: 'doctor_to_doctor' };
    case 'patient':
      return { type: 'patient_to_patient' };
    case 'out':
      return {
        type: 'external',
        $or: [{ referringDoctor: { $ne: null } }, { receivingClinic: PRESENT, referringClinic: BLANK, 'referringContact.name': BLANK }],
      };
    case 'in':
      return {
        type: 'external',
        referringDoctor: null,
        $or: [{ receivingClinic: BLANK }, { referringClinic: PRESENT }, { 'referringContact.name': PRESENT }],
      };
    default:
      return null;
  }
}

/** Days a referral has waited for a reply. Urgent ones are escalated by email after 7. */
export const WAIT_BUCKETS = [
  { key: '0-2', label: 'Up to 2 days', short: '0–2 d', min: 0, max: 2 },
  { key: '3-7', label: '3–7 days', short: '3–7 d', min: 3, max: 7 },
  { key: '8-14', label: '8–14 days', short: '8–14 d', min: 8, max: 14 },
  { key: '15+', label: '15 days or more', short: '15+ d', min: 15, max: null },
] as const;

export const LATE_AFTER_DAYS = 7;

/** referredDate range for a waiting bucket, counted back from `now` in whole days. */
export function waitRange(key: string, now: Date = new Date()) {
  const b = WAIT_BUCKETS.find((x) => x.key === key);
  if (!b) return null;
  const day = 86_400_000;
  const range: { $lte?: Date; $gt?: Date } = { $lte: new Date(now.getTime() - b.min * day) };
  if (b.max !== null) range.$gt = new Date(now.getTime() - (b.max + 1) * day);
  return range;
}

/** Destination key used by the "sent to" chart and the list filter: a doctor here or an outside place. */
export function destinationKey(r: { receivingDoctor?: unknown; receivingClinic?: string | null }) {
  if (r.receivingDoctor) return `d:${String((r.receivingDoctor as { _id?: unknown })?._id ?? r.receivingDoctor)}`;
  if (filled(r.receivingClinic)) return `c:${r.receivingClinic!.trim().toLowerCase()}`;
  return null;
}
