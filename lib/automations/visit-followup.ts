// Visit Follow-Up Reminder Automation
// Checks treatmentPlan.followUp.date on closed visits and sends reminders
// to patients who have not yet received a follow-up reminder.

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { Types } from 'mongoose';

/** Days before the follow-up date to send the reminder */
const REMINDER_DAYS_BEFORE = 2;

export interface VisitFollowUpResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Send follow-up reminders for visits whose treatmentPlan.followUp.date
 * is approaching and where reminderSent is not yet true.
 */
export async function processVisitFollowUpReminders(
  tenantId?: Types.ObjectId | string
): Promise<VisitFollowUpResult> {
  await connectDB();

  const result: VisitFollowUpResult = { processed: 0, sent: 0, failed: 0, errors: [] };

  const tenantFilter = tenantId
    ? { tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId }
    : {};

  const now = new Date();

  // Target window: follow-up date falls between today and REMINDER_DAYS_BEFORE days from now
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + REMINDER_DAYS_BEFORE);
  windowEnd.setHours(23, 59, 59, 999);

  try {
    const visits = await Visit.find({
      ...tenantFilter,
      status: 'closed',
      'treatmentPlan.followUp.date': { $gte: windowStart, $lte: windowEnd },
      'treatmentPlan.followUp.reminderSent': { $ne: true },
    }).populate('patient', 'firstName lastName email phone');

    for (const visit of visits) {
      result.processed++;
      const patient = visit.patient as any;
      if (!patient) continue;

      const followUpDate: Date = (visit.treatmentPlan as any)?.followUp?.date;
      if (!followUpDate) continue;

      const followUpInstructions: string =
        (visit.treatmentPlan as any)?.followUp?.instructions ?? '';

      const followUpDateStr = followUpDate.toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      const daysUntil = Math.ceil(
        (followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const smsMessage =
        `Hi ${patient.firstName}, your follow-up visit is on ${followUpDateStr} ` +
        `(${daysUntil} day${daysUntil === 1 ? '' : 's'} away). ` +
        (followUpInstructions
          ? `Instructions: ${followUpInstructions.slice(0, 80)}. `
          : '') +
        `Please confirm your appointment.`;

      try {
        // SMS
        if (patient.phone) {
          let phone = patient.phone.trim();
          if (!phone.startsWith('+')) phone = `+63${phone.replace(/\D/g, '').slice(-10)}`;
          await sendSMS({ to: phone, message: smsMessage });
        }

        // Email
        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: `Follow-Up Visit Reminder – ${followUpDateStr}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Follow-Up Visit Reminder</h2>
                <p>Dear ${patient.firstName} ${patient.lastName},</p>
                <p>This is a reminder that you have a follow-up visit scheduled on
                   <strong>${followUpDateStr}</strong>.</p>
                ${followUpInstructions
                  ? `<p><strong>Instructions from your provider:</strong><br>${followUpInstructions}</p>`
                  : ''}
                <p>Please contact the clinic to confirm or reschedule your appointment.</p>
                <p>Visit Reference: <strong>${visit.visitCode}</strong></p>
              </div>
            `,
          });
        }

        // In-app notification
        await createNotification({
          type: 'visit_followup_reminder',
          title: 'Follow-Up Visit Reminder',
          message: smsMessage,
          patientId: patient._id,
          tenantId: visit.tenantId,
          metadata: {
            visitId: visit._id,
            visitCode: visit.visitCode,
            followUpDate: followUpDate.toISOString(),
          },
        } as any);

        // Mark reminder as sent on the visit to avoid duplicates
        await Visit.updateOne(
          { _id: visit._id },
          { $set: { 'treatmentPlan.followUp.reminderSent': true, updatedAt: new Date() } }
        );

        result.sent++;
      } catch (err: unknown) {
        result.failed++;
        result.errors.push(
          `Visit ${visit.visitCode}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err: unknown) {
    result.errors.push(
      `Query failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}
