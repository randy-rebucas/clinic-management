import 'server-only';
import { Types } from 'mongoose';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import type { IRepDelivery } from '@/models/RepDelivery';
import { notifyStaff } from '@/lib/notify';
import { sendPushToUserDevices } from '@/lib/push-notifications';

/** Most lines one delivery may carry. */
export const MAX_DELIVERY_LINES = 20;

const CLINIC_AUDIENCE_ROLES = ['admin', 'owner'];

type VisitForDelivery = { clinicId?: unknown; linkedClinicId?: unknown; status: string };

/**
 * The clinic a visit's deliveries go to, or null when it can't carry one: an approved or
 * completed booking (not a request, decline, cancel or no-show), or an own log entry the rep
 * linked to a clinic, unless cancelled.
 */
export function deliveryClinicOf(visit: VisitForDelivery): Types.ObjectId | null {
  if (visit.clinicId) {
    return ['scheduled', 'completed'].includes(visit.status) ? new Types.ObjectId(String(visit.clinicId)) : null;
  }
  if (visit.linkedClinicId && visit.status !== 'cancelled') return new Types.ObjectId(String(visit.linkedClinicId));
  return null;
}

/** "3 lines" / "Amlodipine 5 mg × 20 boxes", for notifications. */
function summary(d: Pick<IRepDelivery, 'lines'>): string {
  if (d.lines.length !== 1) return `${d.lines.length} products`;
  const l = d.lines[0];
  return `${[l.productName, l.strength].filter(Boolean).join(' ')} × ${l.quantity} ${l.unit}`;
}

/** Tell the clinic's admins a rep recorded a delivery for them to confirm. */
export async function notifyClinicOfDelivery(d: Pick<IRepDelivery, '_id' | 'clinicId' | 'repName' | 'repCompany' | 'kind' | 'lines'>) {
  const who = d.repCompany ? `${d.repName} (${d.repCompany})` : d.repName;
  try {
    await notifyStaff({
      tenantId: String(d.clinicId),
      audience: { roles: CLINIC_AUDIENCE_ROLES },
      type: 'visit',
      priority: 'normal',
      title: d.kind === 'sample' ? 'Rep samples to confirm' : 'Rep delivery to confirm',
      message: `${who} recorded ${summary(d)} for your clinic. Confirm what you received.`,
      actionUrl: `/medical-reps?tab=deliveries&delivery=${String(d._id)}`,
      sender: { kind: 'system', name: who },
      metadata: { repDeliveryId: String(d._id) },
    });
  } catch (error) {
    console.error('[rep-deliveries] clinic notification failed:', error);
  }
}

/** Push the clinic's answer to the rep's phone (opens the visit), unless they switched push off. */
export async function notifyRepOfDelivery(
  d: Pick<IRepDelivery, '_id' | 'userId' | 'clinicName' | 'visitId' | 'kind' | 'lines'>,
  event: 'received' | 'rejected',
  note?: string
) {
  try {
    const muted = await MedicalRepresentative.exists({ userId: d.userId, notificationsEnabled: false });
    if (muted) return;
    const what = d.kind === 'sample' ? 'samples' : 'delivery';
    const body =
      event === 'received'
        ? `${d.clinicName} confirmed your ${what}: ${summary(d)}.`
        : `${d.clinicName} didn't confirm your ${what}: ${summary(d)}.`;
    await sendPushToUserDevices(String(d.userId), {
      title: event === 'received' ? 'Delivery confirmed' : 'Delivery not confirmed',
      body: note ? `${body} ${note}`.slice(0, 240) : body,
      tag: `medrep-delivery-${String(d._id)}`,
      data: { screen: 'visits', id: String(d.visitId) },
    });
  } catch (error) {
    console.error('[rep-deliveries] rep push failed:', error);
  }
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
