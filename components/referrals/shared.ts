import { STATE } from '../dashboards/charts';
import { directionOf, type ReferralDirection, type ReferralStatus, type ReferralUrgency } from '@/lib/referrals';

export { URGENCY_BADGE } from '../lab-results/shared';

interface Doc {
  _id: string;
  firstName: string;
  lastName: string;
  title?: string;
  specializationId?: { name?: string } | null;
}

interface PatientRef {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

/** The shape /api/referrals (paged) and /api/referrals/:id return. */
export interface Referral {
  _id: string;
  referralCode?: string;
  type: 'doctor_to_doctor' | 'patient_to_patient' | 'external';
  patient: (PatientRef & { phone?: string; dateOfBirth?: string }) | null;
  referringDoctor?: Doc | null;
  referringPatient?: PatientRef | null;
  referringClinic?: string;
  referringContact?: { name?: string; phone?: string; email?: string } | null;
  receivingDoctor?: Doc | null;
  receivingClinic?: string;
  reason: string;
  urgency: ReferralUrgency;
  specialty?: string;
  notes?: string;
  chiefComplaint?: string;
  diagnosis?: string;
  relevantHistory?: string;
  medications?: string[];
  attachments?: { filename: string; url: string; uploadDate?: string }[];
  status: ReferralStatus;
  referredDate: string;
  acceptedDate?: string;
  completedDate?: string;
  declinedDate?: string;
  declinedReason?: string;
  visit?: { _id: string; visitCode: string; date: string } | null;
  appointment?: { _id: string; appointmentCode?: string; appointmentDate: string; appointmentTime?: string; status?: string } | null;
  followUpRequired?: boolean;
  followUpDate?: string;
  followUpNotes?: string;
  followUpReminderSentAt?: string;
  escalationSentAt?: string;
  feedback?: { rating?: number; comments?: string; submittedAt?: string } | null;
  updatedAt?: string;
}

/**
 * Referral states on the validated appointment-state hues by meaning: waiting for a reply blue
 * (not started), accepted amber (under way), seen teal (done), declined crimson (didn't happen;
 * the patient still needs a place). Cancelled sits outside the hue set: white + gray outline.
 */
export const REF_STATE: Record<ReferralStatus, { label: string; fill: string | null; badge: string }> = {
  pending: { label: 'Waiting for reply', fill: STATE.upcoming.fill, badge: 'bg-white text-gray-700 ring-gray-300' },
  accepted: { label: 'Accepted', fill: STATE.pending.fill, badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  completed: { label: 'Seen', fill: STATE.completed.fill, badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  declined: { label: 'Declined', fill: STATE.noShow.fill, badge: 'bg-red-50 text-red-800 ring-red-200' },
  cancelled: { label: 'Cancelled', fill: null, badge: 'bg-white text-gray-600 ring-gray-300' },
};
export const STATUS_ORDER: ReferralStatus[] = ['pending', 'accepted', 'completed', 'declined', 'cancelled'];

export const doctorName = (d?: Doc | null) => (d ? `${d.title && d.title !== 'Dr.' ? `${d.title} ` : 'Dr. '}${d.firstName} ${d.lastName}`.trim() : null);
export const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : null);
export const specialtyOf = (d?: Doc | null) => d?.specializationId?.name ?? null;

export const direction = (r: Referral): ReferralDirection => directionOf(r);

/** Who sent the patient, in words. */
export function fromLabel(r: Referral): string {
  switch (direction(r)) {
    case 'patient':
      return personName(r.referringPatient) ? `Recommended by ${personName(r.referringPatient)}` : 'Recommended by a patient';
    case 'in':
      return r.referringClinic || r.referringContact?.name || 'Another clinic';
    default:
      return doctorName(r.referringDoctor) ?? 'This clinic';
  }
}

/** Where the patient is going, in words. */
export function toLabel(r: Referral): string {
  if (r.receivingDoctor) return doctorName(r.receivingDoctor)!;
  if (r.receivingClinic) return r.receivingClinic;
  return direction(r) === 'in' || direction(r) === 'patient' ? 'This clinic' : 'Not named';
}

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function waitedLabel(days: number) {
  if (days === 0) return 'since today';
  if (days === 1) return 'for 1 day';
  return `for ${days} days`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
