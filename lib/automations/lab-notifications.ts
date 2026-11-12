// Lab Result Notification Automation
// Automatically notifies patients and doctors when lab results are available

import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { sendSMS, smsSettled } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, delivered, safeNotify, errorMessage, getTenantStaff, claimForSend, releaseClaim } from './shared';
import { LAB_ROLE } from '@/lib/lab-results';

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
  let claimed: Record<string, unknown> | null = null;
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

    // Completed by the lab: held until a clinician has reviewed it.
    if (labResult.status === 'completed' && labResult.awaitingReview) {
      return { success: true, sent: false };
    }

    const patient = labResult.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    // The cron, the staff "tell the patient" button and the completion hook can all reach here at
    // once; only the one holding the claim sends.
    const own = { _id: labResult._id, tenantId };
    if (!(await claimForSend(LabResult, { ...own, notificationSent: { $ne: true } }, 'notificationClaimedAt'))) {
      return { success: true, sent: false };
    }
    claimed = own;

    const testType = labResult.request?.testType || 'lab test';
    let sent = false;
    let smsSent = false;
    let emailSent = false;
    // Stopped for good (opted out, texts off): retrying every run would never change that.
    let smsFinal = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const message = `Your lab results for ${testType} are now available. Request Code: ${labResult.requestCode || 'N/A'}. Please contact the clinic to view your results.`;
        const smsResult = await sendSMS({ tenantId: tenantId, category: 'transactional', template: 'lab-result', patientId: patient._id, to: patient.phone, message });
        if (delivered(smsResult)) sent = smsSent = true;
        else smsFinal = smsSettled(smsResult);
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
          // Never the test name: it shows on the lock screen and goes through Apple/Google.
          body: 'A new lab result is ready to view in the app.',
          tag: `lab-result-${labResult._id}`,
          url: `/lab-results/${labResult._id}`,
        }, { tenantId });
        if (pushResult.sent) sent = true;
      } catch (error) {
        console.error('Error sending lab result push notification:', error);
      }
    }

    // Patients have no User account; the ordering doctor (a User) is notified in-app once.
    const orderedBy = labResult.orderedBy as any;
    // A reviewed result was just seen by its reviewer, and a lab-completed one already asked for review.
    if (orderedBy?._id && options.sendNotification !== false && !labResult.notificationAttempts && labResult.status !== 'reviewed') {
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
          $unset: { notificationClaimedAt: '' },
        }
      );
    }

    if (!sent && smsFinal) {
      await LabResult.updateOne({ _id: labResult._id, tenantId }, { $set: { notificationSent: true }, $unset: { notificationClaimedAt: '' } });
    } else if (!sent) {
      await releaseClaim(LabResult, own, 'notificationClaimedAt');
    }
    return { success: true, sent };
  } catch (error: any) {
    if (claimed) await releaseClaim(LabResult, claimed, 'notificationClaimedAt').catch(() => undefined);
    console.error('Error sending lab result notification:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send lab result notification',
    };
  }
}

/** A new lab order: one alert covers every test on it. */
export interface NewLabOrder {
  orderCode?: string;
  urgency?: string;
  tests: { _id: Types.ObjectId; testType?: string }[];
}

/** Tell the clinic's lab staff, in-app, that a doctor has sent them a new order (one alert per order). */
export async function notifyLabStaffOfRequest(order: NewLabOrder, tenantId: string | Types.ObjectId): Promise<void> {
  if (!order.tests.length) return;
  const staff = await getTenantStaff(tenantId, [LAB_ROLE], '_id');
  if (!staff.length) return;
  const urgency = order.urgency;
  const rush = urgency === 'stat' || urgency === 'urgent';
  const names = order.tests.map((t) => t.testType).filter(Boolean) as string[];
  const testType = names.length ? names.join(', ') : order.tests.length > 1 ? `${order.tests.length} lab tests` : 'a lab test';
  const labResult = { _id: order.tests[0]._id, requestCode: order.orderCode };
  const tid = new Types.ObjectId(String(tenantId));
  await Promise.all(
    staff.map((u) =>
      safeNotify({
        userId: u._id,
        tenantId: tid,
        type: 'lab_result',
        priority: urgency === 'stat' ? 'urgent' : rush ? 'high' : 'normal',
        title: rush ? `${urgency!.toUpperCase()} lab request` : 'New lab request',
        message: `${labResult.requestCode ? `${labResult.requestCode}: ` : ''}${testType} ${names.length > 1 ? 'are' : 'is'} waiting to be received.`,
        relatedEntity: { type: 'lab_result', id: labResult._id },
        actionUrl: `/lab-results/${labResult._id}`,
      })
    )
  );
}

/** How long a save waits before announcing, so the rest of its order (saved right after) goes in one message. */
export const RESULTS_IN_SETTLE_MS = 8000;

/**
 * Tell the patient their results are in and with the doctor for review. Called after the lab
 * completes a test; waits `settleMs`, then announces in one message every test of that test's
 * order (same patient) the lab has completed and that awaits review. Each test is announced once
 * (resultsInNoticeAt): the later saves of an order find nothing left and send nothing.
 * The values stay hidden until review, when sendLabResultNotification says they are ready to view.
 * Follows autoLabNotifications.
 */
export async function sendResultsInNotice(
  labResultId: string | Types.ObjectId,
  tenantId: string | Types.ObjectId,
  options: { settleMs?: number } = {}
): Promise<{ sent: boolean; tests: number }> {
  if (options.settleMs) await new Promise((resolve) => setTimeout(resolve, options.settleMs));
  await connectDB();
  const tid = new Types.ObjectId(String(tenantId));
  if (!automationEnabled(await getSettings(tid.toString()), 'autoLabNotifications')) return { sent: false, tests: 0 };

  const saved = (await LabResult.findOne({ _id: new Types.ObjectId(String(labResultId)), tenantId: tid })
    .select('patient orderCode')
    .lean()) as { _id: Types.ObjectId; patient?: Types.ObjectId; orderCode?: string } | null;
  if (!saved?.patient) return { sent: false, tests: 0 };

  // This test, or its whole order: always one patient's tests.
  const qualifies = {
    tenantId: tid,
    patient: saved.patient,
    status: 'completed',
    awaitingReview: true,
    notificationSent: { $ne: true },
    resultsInNoticeAt: { $exists: false },
  };
  const candidates = (await LabResult.find({ ...qualifies, ...(saved.orderCode ? { orderCode: saved.orderCode } : { _id: saved._id }) })
    .select('_id')
    .limit(50)
    .lean()) as { _id: Types.ObjectId }[];

  // Claim each test first, so a concurrent or repeated call never sends a second message.
  type Claimed = { _id: Types.ObjectId; orderCode?: string; requestCode?: string; request?: { testType?: string } };
  const tests: Claimed[] = [];
  for (const c of candidates) {
    const lab = await LabResult.findOneAndUpdate({ ...qualifies, _id: c._id }, { $set: { resultsInNoticeAt: new Date() } }, { new: true })
      .select('orderCode requestCode request.testType')
      .lean<Claimed | null>();
    if (lab) tests.push(lab);
  }
  if (!tests.length) return { sent: false, tests: 0 };
  tests.sort((a, b) => String(a.requestCode ?? '').localeCompare(String(b.requestCode ?? ''), undefined, { numeric: true }));

  const Patient = (await import('@/models/Patient')).default;
  const patient = (await Patient.findOne({ _id: saved.patient, tenantIds: tid }).select('firstName lastName email phone').lean()) as {
    _id: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  } | null;
  if (!patient) return { sent: false, tests: tests.length };

  const names = tests.map((l) => l.request?.testType).filter(Boolean) as string[];
  const what = names.length ? names.join(', ') : 'your lab tests';
  const ref = tests[0].orderCode || tests[0].requestCode || '';
  let sent = false;

  if (patient.phone) {
    try {
      const message = `Your lab results for ${what} are in. Your doctor is reviewing them; we'll let you know when they're ready to view.${ref ? ` Ref: ${ref}.` : ''}`;
      const result = await sendSMS({ tenantId: tid, category: 'transactional', template: 'lab-result-in', patientId: patient._id, to: patient.phone, message });
      if (delivered(result)) sent = true;
    } catch (error) {
      console.error('Error sending results-in SMS:', error);
    }
  }

  if (patient.email) {
    try {
      const { escapeHtml } = await import('@/lib/email');
      const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2196F3;">Your lab results are in</h2>
          <p>Dear ${escapeHtml(patient.firstName ?? '')} ${escapeHtml(patient.lastName ?? '')},</p>
          <p>The laboratory has finished your ${escapeHtml(what)}${ref ? ` (reference ${escapeHtml(ref)})` : ''}.</p>
          <p>Your doctor is reviewing the results now. We will let you know as soon as they are ready to view.</p>
          <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
        </div></body></html>`;
      const result = await sendEmail({ to: patient.email, subject: 'Your lab results are in', html });
      if (delivered(result)) sent = true;
    } catch (error) {
      console.error('Error sending results-in email:', error);
    }
  }

  try {
    const push = await sendPushToPatientDevices(
      patient._id.toString(),
      {
        title: 'Lab results are in',
        // Never the test name: it shows on the lock screen and goes through Apple/Google.
        body: 'Your doctor is reviewing them. We’ll let you know when they’re ready to view.',
        // Not "lab-result-<id>": the app opens that result, which stays hidden until review.
        tag: `lab-results-in-${tests[0]._id}`,
      },
      { tenantId: tid }
    );
    if (push.sent) sent = true;
  } catch (error) {
    console.error('Error sending results-in push notification:', error);
  }

  return { sent, tests: tests.length };
}

/** Ask the ordering doctor, in-app, to review a result the lab has completed; the patient hears after. */
export async function notifyDoctorToReview(
  labResult: { _id: Types.ObjectId; orderedBy?: unknown; request?: { testType?: string } },
  tenantId: string | Types.ObjectId
): Promise<void> {
  const doctor = (labResult.orderedBy as { _id?: Types.ObjectId } | undefined)?._id ?? labResult.orderedBy;
  if (!doctor || !Types.ObjectId.isValid(String(doctor))) return;
  await safeNotify({
    userId: new Types.ObjectId(String(doctor)),
    tenantId: new Types.ObjectId(String(tenantId)),
    type: 'lab_result',
    priority: 'normal',
    title: 'Lab result to review',
    message: `Results for ${labResult.request?.testType || 'a lab test'} are in. The patient can see them once you mark it reviewed.`,
    relatedEntity: { type: 'lab_result', id: labResult._id },
    actionUrl: `/lab-results/${labResult._id}`,
  });
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
      // Lab-completed results wait for review (awaitingReview) before the patient is told.
      $or: [{ status: 'reviewed' }, { status: 'completed', awaitingReview: { $ne: true } }],
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
  }, { setting: 'autoLabNotifications' });

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

