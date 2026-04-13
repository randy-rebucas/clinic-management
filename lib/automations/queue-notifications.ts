/**
 * Queue Position Notifications
 * Sends SMS and/or push notifications to patients when their queue position
 * reaches a configurable threshold, or when they are called.
 */

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import { sendPushToUser } from '@/lib/push-notifications';
import { getSettings } from '@/lib/settings';
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

    const settings = await getSettings(options.tenantId?.toString());
    const clinicName = (settings as any).clinicName ?? 'The Clinic';

    const queueId =
      typeof options.queueId === 'string' ? new Types.ObjectId(options.queueId) : options.queueId;

    const queueEntry = await Queue.findById(queueId).lean() as any;
    if (!queueEntry) return;

    const patient = await Patient.findById(queueEntry.patient).select('firstName phone').lean() as any;
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
      const tenantQuery: any = { status: 'waiting' };
      if (options.tenantId) tenantQuery.tenantId = typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId;

      const waitingAhead = await Queue.countDocuments({
        ...tenantQuery,
        priority: { $lte: queueEntry.priority },
        queuedAt: { $lt: queueEntry.queuedAt },
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
      let phone = patient.phone.trim();
      if (!phone.startsWith('+')) phone = `+1${phone.replace(/\D/g, '')}`;
      sendSMS({ to: phone, message }).catch((e) =>
        console.error('[queue-notifications] SMS error:', e)
      );
    }

    // Push (fire-and-forget)
    if (pushTitle && pushBody) {
      sendPushToUser(queueEntry.patient.toString(), {
        title: pushTitle,
        body: pushBody,
        tag: `queue-${queueId}`,
        url: '/queue',
      }, options.tenantId?.toString()).catch((e) =>
        console.error('[queue-notifications] Push error:', e)
      );
    }
  } catch (error) {
    console.error('[queue-notifications] Error sending queue notification:', error);
  }
}
