/**
 * Queue Position Notifications
 * Sends SMS and/or push notifications to patients when their queue position
 * reaches a configurable threshold, or when they are called.
 */

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { getSettings } from '@/lib/settings';
import { aheadOf } from '@/lib/queue-order';
import { Types } from 'mongoose';

export interface QueueNotificationOptions {
  queueId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  /** New status that triggered the check */
  newStatus: string;
}

/**
 * Send a notification to the patient when their queue position is close.
 * Called from the queue PUT handler after a status change.
 */
export async function notifyQueuePatient(options: QueueNotificationOptions): Promise<void> {
  try {
    await connectDB();

    if (!options.tenantId) return;
    const tenantObjectId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantObjectId.toString());
    const clinicName = (settings as any).clinicName ?? 'The Clinic';

    const queueId =
      typeof options.queueId === 'string' ? new Types.ObjectId(options.queueId) : options.queueId;

    const queueEntry = await Queue.findOne({ _id: queueId, tenantId: tenantObjectId }).lean() as any;
    if (!queueEntry) return;

    const patient = await Patient.findOne({ _id: queueEntry.patient, tenantIds: tenantObjectId })
      .select('firstName phone')
      .lean() as any;
    if (!patient) return;

    const firstName = patient.firstName ?? 'Patient';

    let message: string | null = null;
    let pushTitle: string | null = null;
    let pushBody: string | null = null;

    if (options.newStatus === 'in-progress') {
      // Doctor is ready — highest priority
      message = `Hi ${firstName}, it's your turn! Please proceed to your assigned room. – ${clinicName}`;
      pushTitle = "It's Your Turn!";
      pushBody = `${clinicName}: Please proceed to your assigned room.`;
    } else if (options.newStatus === 'waiting') {
      // Patient just entered the queue — check their position
      const tenantQuery: any = { status: 'waiting', tenantId: tenantObjectId };

      const waitingAhead = await Queue.countDocuments({
        ...tenantQuery,
        ...aheadOf(queueEntry),
      });

      const position = waitingAhead + 1;

      // Notify if ≤ 3 in front or estimated wait ≤ 15 min
      const estimatedWait = queueEntry.estimatedWaitTime ?? position * 10;
      if (position <= 3 || estimatedWait <= 15) {
        message = `Hi ${firstName}, you are #${position} in the queue at ${clinicName}. Estimated wait: ~${estimatedWait} min.`;
        pushTitle = `Queue Update — #${position}`;
        pushBody = `You are next in line at ${clinicName}. Estimated wait: ~${estimatedWait} min.`;
      }
    }

    if (!message && !pushTitle) return;

    // SMS
    if (message && patient.phone) {
      sendSMS({ to: patient.phone, message }).catch((e) =>
        console.error('[queue-notifications] SMS error:', e)
      );
    }

    // Push (fire-and-forget) — patients receive push via their registered
    // MobileDevice records, not the staff-only PushSubscription/web-push path.
    if (pushTitle && pushBody) {
      sendPushToPatientDevices(queueEntry.patient.toString(), {
        title: pushTitle,
        body: pushBody,
        tag: `queue-${queueId}`,
        url: '/queue',
      }, { tenantId: tenantObjectId }).catch((e) =>
        console.error('[queue-notifications] Push error:', e)
      );
    }
  } catch (error) {
    console.error('[queue-notifications] Error sending queue notification:', error);
  }
}
