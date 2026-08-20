/**
 * Queue Position Notifications
 * Sends SMS and/or push notifications to patients when their queue position
 * reaches a configurable threshold, or when they are called.
 */

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getQueueById } from '@/lib/data/queue';
import prisma from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { sendPushToUser } from '@/lib/push-notifications';
import { getSettings } from '@/lib/settings';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface QueueNotificationOptions {
  queueId: string;
  tenantId?: string;
  /** New status that triggered the check */
  newStatus: string;
}

/**
 * Send a notification to the patient when their queue position is close.
 * Called from the queue PUT handler after a status change.
 */
export async function notifyQueuePatient(options: QueueNotificationOptions): Promise<void> {
  try {
    const tenantId = options.tenantId ? String(options.tenantId) : undefined;
    const queueId = String(options.queueId);

    await run(tenantId, async () => {
      const settings = await getSettings(tenantId);
      const clinicName = (settings as any).clinicName ?? 'The Clinic';

      const queueEntry = await getQueueById(queueId);
      if (!queueEntry) return;

      const patientId =
        typeof queueEntry.patient === 'string' ? queueEntry.patient : (queueEntry.patient as any)?.id;
      if (!patientId) return;

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { firstName: true, phone: true },
      });
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
        const waitingAhead = await prisma.queue.count({
          where: {
            status: 'waiting',
            priority: { lte: queueEntry.priority as any },
            queuedAt: { lt: queueEntry.queuedAt as any },
          },
        });

        const position = waitingAhead + 1;

        // Notify if ≤ 3 in front or estimated wait ≤ 15 min
        const estimatedWait = (queueEntry as any).estimatedWaitTime ?? position * 10;
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
        sendPushToUser(String(patientId), {
          title: pushTitle,
          body: pushBody,
          tag: `queue-${queueId}`,
          url: '/queue',
        }, tenantId).catch((e) =>
          console.error('[queue-notifications] Push error:', e)
        );
      }
    });
  } catch (error) {
    console.error('[queue-notifications] Error sending queue notification:', error);
  }
}
