/**
 * Queue Position Notifications
 * Sends SMS and/or push notifications to patients when they are called, and push updates as
 * they move up the line ("You're 3rd in line", "You're next").
 */

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { getSettings } from '@/lib/settings';
import { QUEUE_SORT } from '@/lib/queue-order';
import { ordinal, queuePosition } from '@/lib/queue-position';
import { refreshQueueWaits } from '@/lib/queue-wait';
import { Types } from 'mongoose';

/** Patients this close to the front get a push each time they move up. */
export const NOTIFY_WITHIN_POSITION = 3;
/** Upper bound on waiting entries scanned per update (one clinic's day). */
const MAX_SCAN = 300;
/** The statuses that can send the patient a message; the rest only move the line. */
const MESSAGE_STATUSES = new Set(['in-progress', 'away', 'waiting']);

export interface QueueNotificationOptions {
  queueId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  /** New status that triggered the check */
  newStatus: string;
}

async function clinicNameOf(tenantId: Types.ObjectId): Promise<string> {
  const settings = await getSettings(tenantId.toString());
  return (settings as any).clinicName ?? 'The Clinic';
}

/**
 * Send a notification to the patient when they are called, miss their call or join the line,
 * then update everyone whose place in line changed. Called from the queue PUT handler after a status change.
 */
export async function notifyQueuePatient(options: QueueNotificationOptions): Promise<void> {
  try {
    await connectDB();

    if (!options.tenantId) return;
    const tenantObjectId = new Types.ObjectId(String(options.tenantId));
    const clinicName = await clinicNameOf(tenantObjectId);

    // First, so the message below quotes the new estimate.
    await refreshQueueWaits(tenantObjectId);

    if (!MESSAGE_STATUSES.has(options.newStatus)) {
      await pushPositions(tenantObjectId, clinicName);
      return;
    }

    const queueId =
      typeof options.queueId === 'string' ? new Types.ObjectId(options.queueId) : options.queueId;

    const queueEntry = await Queue.findOne({ _id: queueId, tenantId: tenantObjectId }).lean() as any;
    if (!queueEntry) return;

    const patient = await Patient.findOne({ _id: queueEntry.patient, tenantIds: tenantObjectId })
      .select('firstName phone')
      .lean() as any;

    if (patient) {
      const firstName = patient.firstName ?? 'Patient';

      const tell = (sms: string, title: string, body: string) => {
        if (patient.phone) {
          sendSMS({ to: patient.phone, message: sms }).catch((e) =>
            console.error('[queue-notifications] SMS error:', e)
          );
        }
        // Push (fire-and-forget) — patients receive push via their registered
        // MobileDevice records, not the staff-only PushSubscription/web-push path.
        sendPushToPatientDevices(queueEntry.patient.toString(), {
          title,
          body,
          tag: `queue-${queueId}`,
          url: '/queue',
          data: { type: 'queue', queueId: String(queueId) },
        }, { tenantId: tenantObjectId }).catch((e) =>
          console.error('[queue-notifications] Push error:', e)
        );
      };

      if (options.newStatus === 'in-progress') {
        // Doctor is ready — highest priority
        tell(
          `Hi ${firstName}, it's your turn! Please proceed to your assigned room. – ${clinicName}`,
          "It's Your Turn!",
          `${clinicName}: Please proceed to your assigned room.`
        );
      } else if (options.newStatus === 'away' && queueEntry.awayReason === 'missed') {
        tell(
          `Hi ${firstName}, we called you but couldn't find you. Your place is saved. Please see the front desk. – ${clinicName}`,
          'We Called You',
          `${clinicName}: Your place is saved. Please see the front desk.`
        );
      } else if (options.newStatus === 'waiting' && patient.phone) {
        // Patient just entered the line close to the front: one SMS (the app gets pushes below).
        const position = await queuePosition(tenantObjectId, queueEntry);
        const estimatedWait = queueEntry.estimatedWaitTime ?? position * 10;
        if (position <= NOTIFY_WITHIN_POSITION || estimatedWait <= 15) {
          sendSMS({
            to: patient.phone,
            message: `Hi ${firstName}, you are #${position} in the queue at ${clinicName}. Estimated wait: ~${estimatedWait} min.`,
          }).catch((e) => console.error('[queue-notifications] SMS error:', e));
        }
      }
    }

    await pushPositions(tenantObjectId, clinicName);
  } catch (error) {
    console.error('[queue-notifications] Error sending queue notification:', error);
  }
}

/** Waiting entries with their place in their doctor's line, front first. Exported for tests. */
export function positionsByLine<T extends { doctor?: unknown }>(sortedWaiting: T[]): Array<{ entry: T; position: number }> {
  const seen = new Map<string, number>();
  return sortedWaiting.map((entry) => {
    const key = String(entry.doctor ?? 'none');
    const position = (seen.get(key) ?? 0) + 1;
    seen.set(key, position);
    return { entry, position };
  });
}

/** Saves everyone's new wait estimate and tells patients who moved up. Safe to call after any queue change. */
export async function notifyQueuePositions(tenantId: string | Types.ObjectId, clinicName?: string): Promise<void> {
  try {
    await connectDB();
    const tenantObjectId = new Types.ObjectId(String(tenantId));
    await refreshQueueWaits(tenantObjectId);
    await pushPositions(tenantObjectId, clinicName);
  } catch (error) {
    console.error('[queue-notifications] Error updating the line:', error);
  }
}

/**
 * Push "You're Nth in line" to waiting patients near the front whose position improved since
 * their last update. Each step is claimed with a conditional write first, so concurrent triggers
 * (two desks updating the queue at once) send it once.
 */
async function pushPositions(tenantObjectId: Types.ObjectId, clinicName?: string): Promise<void> {
  try {
    const waiting = await Queue.find({ tenantId: tenantObjectId, status: 'waiting' })
      .select('patient doctor priority queuedAt positionNotified')
      .sort(QUEUE_SORT)
      .limit(MAX_SCAN)
      .lean<{ _id: Types.ObjectId; patient: Types.ObjectId; doctor?: Types.ObjectId; positionNotified?: number }[]>();

    const due = positionsByLine(waiting).filter(
      ({ entry, position }) =>
        position <= NOTIFY_WITHIN_POSITION && (entry.positionNotified == null || position < entry.positionNotified)
    );
    if (!due.length) return;
    const name = clinicName ?? (await clinicNameOf(tenantObjectId));

    for (const { entry, position } of due) {
      const claimed = await Queue.updateOne(
        {
          _id: entry._id,
          status: 'waiting',
          $or: [{ positionNotified: { $exists: false } }, { positionNotified: null }, { positionNotified: { $gt: position } }],
        },
        { $set: { positionNotified: position } }
      );
      if (claimed.modifiedCount !== 1) continue;

      sendPushToPatientDevices(
        entry.patient.toString(),
        position === 1
          ? {
              title: "You're next",
              body: `${name}: please stay close, you'll be called soon.`,
              tag: `queue-${entry._id}`,
              url: '/queue',
              data: { type: 'queue', queueId: String(entry._id), position: '1' },
            }
          : {
              title: `You're ${ordinal(position)} in line`,
              body: `${name}: ${position - 1} ${position - 1 === 1 ? 'patient' : 'patients'} ahead of you.`,
              tag: `queue-${entry._id}`,
              url: '/queue',
              data: { type: 'queue', queueId: String(entry._id), position: String(position) },
            },
        { tenantId: tenantObjectId }
      ).catch((e) => console.error('[queue-notifications] Push error:', e));
    }
  } catch (error) {
    console.error('[queue-notifications] Error sending queue position updates:', error);
  }
}
