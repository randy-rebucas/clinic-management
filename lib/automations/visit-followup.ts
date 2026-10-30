// Visit Follow-Up Reminder Automation
// Checks treatmentPlan.followUp.date on closed visits and sends reminders
// to patients who have not yet received a follow-up reminder.

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, daysUntilInTz, displayDate, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

/** Days before the follow-up date to send the reminder */
const REMINDER_DAYS_BEFORE = 2;

export interface VisitFollowUpResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

async function processTenant(tenant: AutomationTenant): Promise<VisitFollowUpResult> {
  const result: VisitFollowUpResult = { processed: 0, sent: 0, failed: 0, errors: [] };
  const tz = tenant.timezone;
  const now = new Date();

  const windowStart = dayRangeInTz(now, tz).start;
  const windowEnd = dayRangeOffsetInTz(REMINDER_DAYS_BEFORE, now, tz).end;

  const visits = await Visit.find({
    tenantId: tenant.tenantObjectId,
    status: 'closed',
    'treatmentPlan.followUp.date': { $gte: windowStart, $lte: windowEnd },
    'treatmentPlan.followUp.reminderSent': { $ne: true },
  })
    .populate('patient', 'firstName lastName email phone')
    .limit(BATCH_LIMIT);

  for (const visit of visits) {
    result.processed++;
    const patient = visit.patient as any;
    const followUpDate: Date | undefined = (visit.treatmentPlan as any)?.followUp?.date;
    if (!patient || !followUpDate) continue;

    const followUpInstructions: string = (visit.treatmentPlan as any)?.followUp?.instructions ?? '';
    const followUpDateStr = displayDate(followUpDate, tz);
    const daysUntil = daysUntilInTz(followUpDate, tz, now);
    const when = daysUntil <= 0 ? 'today' : `${daysUntil} day${daysUntil === 1 ? '' : 's'} away`;

    const smsMessage =
      `Hi ${patient.firstName}, your follow-up visit is on ${followUpDateStr} (${when}). ` +
      (followUpInstructions ? `Instructions: ${followUpInstructions.slice(0, 80)}. ` : '') +
      `Please confirm your appointment.`;

    try {
      if (patient.phone) {
        await sendSMS({ to: patient.phone, message: smsMessage });
      }

      if (patient.email) {
        await sendEmail({
          to: patient.email,
          subject: `Follow-Up Visit Reminder – ${followUpDateStr}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto">
              <h2>Follow-Up Visit Reminder</h2>
              <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
              <p>This is a reminder that you have a follow-up visit scheduled on
                 <strong>${escapeHtml(followUpDateStr)}</strong>.</p>
              ${followUpInstructions
                ? `<p><strong>Instructions from your provider:</strong><br>${escapeHtml(followUpInstructions)}</p>`
                : ''}
              <p>Please contact the clinic to confirm or reschedule your appointment.</p>
              ${visit.visitCode ? `<p>Visit Reference: <strong>${escapeHtml(visit.visitCode)}</strong></p>` : ''}
            </div>
          `,
        });
      }

      // Lock-screen text: the date only, never the provider's instructions.
      if (patient._id) {
        const appointmentId = visit.followUpAppointmentId ? String(visit.followUpAppointmentId) : null;
        try {
          await sendPushToPatientDevices(String(patient._id), {
            title: 'Follow-up Visit Reminder',
            body: `Your follow-up visit is on ${followUpDateStr} (${when}). ${appointmentId ? 'Tap for details.' : 'Tap to book a time.'}`,
            tag: `followup-${visit._id}`,
            ...(appointmentId ? { data: { appointmentId } } : {}),
          }, { tenantId: tenant.tenantObjectId });
        } catch (error) {
          console.error('Error sending follow-up reminder push notification:', error);
        }
      }

      // Patients have no User account, so no in-app notification. The marker is set once
      // the sends were attempted so a later failure can't trigger a daily resend.
      result.sent++;
    } catch (err: unknown) {
      result.failed++;
      result.errors.push(`Visit ${visit.visitCode || visit._id}: ${errorMessage(err)}`);
    }

    try {
      await Visit.updateOne(
        { _id: visit._id, tenantId: tenant.tenantObjectId },
        { $set: { 'treatmentPlan.followUp.reminderSent': true } }
      );
    } catch (err) {
      result.errors.push(`Visit ${visit.visitCode || visit._id}: failed to record reminder (${errorMessage(err)})`);
    }
  }

  return result;
}

/**
 * Send follow-up reminders for visits whose treatmentPlan.followUp.date
 * is approaching and where reminderSent is not yet true.
 * Without a tenantId every active tenant is processed.
 */
export async function processVisitFollowUpReminders(
  tenantId?: Types.ObjectId | string
): Promise<VisitFollowUpResult> {
  await connectDB();
  const total: VisitFollowUpResult = { processed: 0, sent: 0, failed: 0, errors: [] };

  try {
    const runs = await forEachTenant(tenantId, processTenant);
    for (const run of runs) {
      if (!run.result) {
        total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
        continue;
      }
      total.processed += run.result.processed;
      total.sent += run.result.sent;
      total.failed += run.result.failed;
      total.errors.push(...run.result.errors);
    }
  } catch (err: unknown) {
    total.errors.push(`Query failed: ${errorMessage(err)}`);
  }

  return total;
}
