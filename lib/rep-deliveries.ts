import 'server-only';
import { Types } from 'mongoose';
import InventoryItem from '@/models/Inventory';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import type { IRepDelivery } from '@/models/RepDelivery';
import { recordMovement } from '@/lib/inventory-movements';
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

/** Where one received line goes: nowhere, a new stock item, or an existing one (its id). */
export type StockTarget = 'none' | 'new' | string;

/**
 * Put a received line into the clinic's stock as a restock, with the rep's company as supplier
 * and the delivery as reference, through the same ledger as a manual restock. Returns the stock
 * item's id, or null when the target item wasn't found.
 */
export async function receiveLineIntoStock(opts: {
  tenantId: Types.ObjectId;
  deliveryId: unknown;
  line: { productName: string; strength?: string; unit: string; expiryDate?: Date; lotNumber?: string };
  quantity: number;
  target: Exclude<StockTarget, 'none'>;
  supplier: string;
  userId: string;
}): Promise<Types.ObjectId | null> {
  const { tenantId, line, quantity, target, supplier, userId } = opts;
  const now = new Date();
  const reference = `Rep delivery ${String(opts.deliveryId)}${line.lotNumber ? ` · lot ${line.lotNumber}` : ''}`;

  let itemId: Types.ObjectId;
  let quantityAfter: number;
  if (target === 'new') {
    const item = await InventoryItem.create({
      tenantId,
      name: [line.productName, line.strength].filter(Boolean).join(' '),
      category: 'medicine',
      quantity,
      unit: line.unit,
      supplier,
      ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      lastRestocked: now,
      lastRestockedBy: userId,
    });
    itemId = item._id;
    quantityAfter = item.quantity;
  } else {
    if (!Types.ObjectId.isValid(target)) return null;
    const current = await InventoryItem.findOne({ _id: target, tenantId }).select('quantity expiryDate').lean<{ quantity: number; expiryDate?: Date } | null>();
    if (!current) return null;
    // One expiry per item, as on a manual restock: the new batch's date replaces an expired or
    // empty batch's; otherwise the earlier date stands.
    const expired = current.expiryDate && current.expiryDate < now;
    const keepOld = current.expiryDate && !expired && current.quantity > 0 && line.expiryDate && current.expiryDate < line.expiryDate;
    const item = await InventoryItem.findOneAndUpdate(
      { _id: target, tenantId },
      {
        $inc: { quantity },
        $set: { lastRestocked: now, lastRestockedBy: userId, ...(line.expiryDate && !keepOld ? { expiryDate: line.expiryDate } : {}) },
      },
      { new: true, runValidators: true }
    );
    if (!item) return null;
    itemId = item._id;
    quantityAfter = item.quantity;
  }

  await recordMovement({
    tenantId,
    item: itemId,
    type: 'restock',
    change: quantity,
    quantityAfter,
    supplier,
    reference,
    batchExpiry: line.expiryDate,
    performedBy: userId,
  });
  return itemId;
}
