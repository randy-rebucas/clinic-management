// Lab Result Notification Automation
// Automatically notifies patients and doctors when lab results are available

import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, delivered, safeNotify, errorMessage } from './shared';

export interface LabNotificationOptions {
  labResultId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
  sendPush?: boolean;
}

/** Give up on a result after this many runs without reaching the patient. */
const MAX_NOTIFICATION_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Send notification for lab result
 */
export async function sendLabResultNotification(options: LabNotificationOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const filter: Record<string, unknown> = { _id: new Types.ObjectId(String(options.labResultId)) };
    if (options.tenantId) filter.tenantId = new Types.ObjectId(String(options.tenantId));

    const labResult = await LabResult.findOne(filter)
      .populate('patient', 'firstName lastName email phone')
      .populate('visit', 'visitCode date')
      .populate('orderedBy', 'name email');

    if (!labResult || !labResult.tenantId) {
      return { success: false, sent: false, error: 'Lab result not found' };
    }
    const tenantId = new Types.ObjectId(String(labResult.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoLabNotifications')) {
      return { success: true, sent: false };
    }

    if (labResult.status !== 'completed' && labResult.status !== 'reviewed') {
      return { success: false, sent: false, error: 'Lab result is not completed' };
    }

    if (labResult.notificationSent) {
      return { success: true, sent: false };
    }

    const patient = labResult.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const testType = labResult.request?.testType || 'lab test';
    let sent = false;
    let smsSent = false;
    let emailSent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const message = `Your lab results for ${testType} are now available. Request Code: ${labResult.requestCode || 'N/A'}. Please contact the clinic to view your results.`;
        const smsResult = await sendSMS({ to: patient.phone, message });
        if (delivered(smsResult)) sent = smsSent = true;
      } catch (error) {
        console.error('Error sending lab result SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateLabResultEmail(labResult);
        const emailResult = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        if (delivered(emailResult)) sent = emailSent = true;
      } catch (error) {
        console.error('Error sending lab result email:', error);
      }
    }

    if (options.sendPush !== false && patient._id) {
      try {
        const pushResult = await sendPushToPatientDevices(patient._id.toString(), {
          title: 'Lab Results Available',
          body: `Your results for ${testType} are ready to view.`,
          tag: `lab-result-${labResult._id}`,
          url: `/lab-results/${labResult._id}`,
        });
        if (pushResult.sent) sent = true;
      } catch (error) {
        console.error('Error sending lab result push notification:', error);
      }
    }

    // Patients have no User account; the ordering doctor (a User) is notified in-app once.
    const orderedBy = labResult.orderedBy as any;
    if (orderedBy?._id && options.sendNotification !== false && !labResult.notificationAttempts) {
      await safeNotify({
        userId: orderedBy._id,
        tenantId,
        type: 'lab_result',
        priority: 'normal',
        title: 'Lab Results Available',
        message: `Lab results for ${testType} are now available for review.`,
        relatedEntity: { type: 'lab_result', id: labResult._id },
        actionUrl: `/lab-results/${labResult._id}`,
      });
    }

    if (sent) {
      await LabResult.updateOne(
        { _id: labResult._id, tenantId },
        {
          $set: {
            notificationSent: true,
            notificationSentAt: new Date(),
            notificationMethod: smsSent && emailSent ? 'both' : emailSent ? 'email' : 'sms',
          },
        }
      );
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send lab result notification',
    };
  }
}

export interface LabNotificationBatchResult {
  processed: number;
  sent: number;
  failed: number;
  gaveUp: number;
  errors: string[];
}

/**
 * Notify patients about completed lab results that haven't been sent yet.
 * Oldest first; each attempt is counted and a result is retired after
 * MAX_NOTIFICATION_ATTEMPTS so stuck records can't block the queue.
 */
export async function processLabNotifications(tenantId?: string | Types.ObjectId): Promise<LabNotificationBatchResult> {
  await connectDB();
  const total: LabNotificationBatchResult = { processed: 0, sent: 0, failed: 0, gaveUp: 0, errors: [] };

  const runs = await forEachTenant(tenantId, async (tenant) => {
    const out: LabNotificationBatchResult = { processed: 0, sent: 0, failed: 0, gaveUp: 0, errors: [] };
    // Switched off: leave the results untouched. Counting these runs as failed attempts used to
    // retire every result after five runs, so turning the switch back on sent nothing.
    if (!automationEnabled(await getSettings(tenant.tenantId), 'autoLabNotifications')) return out;
    const pending = await LabResult.find({
      tenantId: tenant.tenantObjectId,
      status: { $in: ['completed', 'reviewed'] },
      notificationSent: { $ne: true },
      notificationFailedAt: { $exists: false },
    })
      .select('_id notificationAttempts')
      .sort({ updatedAt: 1 })
      .limit(BATCH_SIZE)
      .lean();

    for (const lr of pending as any[]) {
      out.processed++;
      let sent = false;
      try {
        const r = await sendLabResultNotification({ labResultId: lr._id, tenantId: tenant.tenantObjectId });
        sent = r.sent;
        if (!r.success && r.error) out.errors.push(`LabResult ${lr._id}: ${r.error}`);
      } catch (err) {
        out.errors.push(`LabResult ${lr._id}: ${errorMessage(err)}`);
      }

      if (sent) {
        out.sent++;
        continue;
      }
      out.failed++;
      const attempts = (lr.notificationAttempts || 0) + 1;
      const update: Record<string, unknown> = { $set: { notificationAttempts: attempts } };
      if (attempts >= MAX_NOTIFICATION_ATTEMPTS) {
        (update.$set as Record<string, unknown>).notificationFailedAt = new Date();
        out.gaveUp++;
      }
      await LabResult.updateOne({ _id: lr._id, tenantId: tenant.tenantObjectId }, update).catch((err) =>
        out.errors.push(`LabResult ${lr._id}: ${errorMessage(err)}`)
      );
    }
    return out;
  });

  for (const run of runs) {
    if (!run.result) {
      total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    total.processed += run.result.processed;
    total.sent += run.result.sent;
    total.failed += run.result.failed;
    total.gaveUp += run.result.gaveUp;
    total.errors.push(...run.result.errors);
  }
  return total;
}

/**
 * Check for abnormal/critical lab values and send urgent alerts
 */
export async function checkAbnormalLabValues(labResultId: string | Types.ObjectId): Promise<{
  hasAbnormal: boolean;
  critical: boolean;
  alertsSent: boolean;
}> {
  try {
    await connectDB();

    const labResultIdObj = typeof labResultId === 'string' 
      ? new Types.ObjectId(labResultId) 
      : labResultId;

    const labResult = await LabResult.findById(labResultIdObj)
      .populate('patient', 'firstName lastName email phone')
      .populate('orderedBy', 'name email');

    if (!labResult || !labResult.abnormalFlags) {
      return { hasAbnormal: false, critical: false, alertsSent: false };
    }

    const abnormalFlags = labResult.abnormalFlags as any;
    const hasAbnormal = Object.keys(abnormalFlags).length > 0;
    const critical = Object.values(abnormalFlags).some((flag: any) => 
      flag === 'high' || flag === 'low'
    );

    if (hasAbnormal && critical) {
      // Send urgent notification to doctor
      const orderedBy = labResult.orderedBy as any;
      if (orderedBy && orderedBy._id) {
        try {
          await createNotification({
            userId: orderedBy._id,
            tenantId: labResult.tenantId,
            type: 'lab_result',
            priority: 'urgent',
            title: 'URGENT: Abnormal Lab Results',
            message: `Lab results for ${labResult.request.testType} show abnormal/critical values. Immediate review required.`,
            relatedEntity: {
              type: 'lab_result',
              id: labResult._id,
            },
            actionUrl: `/lab-results/${labResult._id}`,
          });
          return { hasAbnormal: true, critical: true, alertsSent: true };
        } catch (error) {
          console.error('Error sending urgent lab alert:', error);
        }
      }
    }

    return { hasAbnormal, critical, alertsSent: false };
  } catch (error: any) {
    console.error('Error checking abnormal lab values:', error);
    return { hasAbnormal: false, critical: false, alertsSent: false };
  }
}

