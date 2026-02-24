// Referral Follow-Up Automation
// Reminds doctors and patients about pending referral follow-up dates.
// Also escalates referrals that have been pending too long.

import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { Types } from 'mongoose';

/** Days before follow-up date to send a reminder */
const REMINDER_DAYS_BEFORE = 3;

/** Days after referredDate before escalating a still-pending referral */
const ESCALATION_DAYS = 7;

export interface ReferralFollowUpResult {
  reminders: { processed: number; sent: number; failed: number };
  escalations: { processed: number; sent: number; failed: number };
  errors: string[];
}

/**
 * Process referral follow-up reminders and escalations.
 */
export async function processReferralFollowUps(
  tenantId?: Types.ObjectId | string
): Promise<ReferralFollowUpResult> {
  await connectDB();

  const result: ReferralFollowUpResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    escalations: { processed: 0, sent: 0, failed: 0 },
    errors: [],
  };

  const tenantFilter = tenantId
    ? { tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId }
    : {};

  const now = new Date();

  // ── 1. Follow-up date reminders ─────────────────────────────────────────
  try {
    const reminderStart = new Date(now);
    reminderStart.setDate(reminderStart.getDate() + REMINDER_DAYS_BEFORE);
    const reminderEnd = new Date(reminderStart);
    reminderEnd.setHours(23, 59, 59, 999);
    reminderStart.setHours(0, 0, 0, 0);

    const referrals = await Referral.find({
      ...tenantFilter,
      followUpRequired: true,
      status: { $in: ['pending', 'accepted'] },
      followUpDate: { $gte: reminderStart, $lte: reminderEnd },
    })
      .populate('patient', 'firstName lastName email phone')
      .populate('referringDoctor', 'firstName lastName email')
      .populate('receivingDoctor', 'firstName lastName email');

    for (const referral of referrals) {
      result.reminders.processed++;
      const patient = referral.patient as any;
      if (!patient) continue;

      const followUpDateStr = referral.followUpDate!.toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      const patientMsg =
        `Hi ${patient.firstName}, a follow-up is scheduled for your referral ` +
        `(Ref: ${referral.referralCode}) on ${followUpDateStr}. ` +
        `Please contact ${referral.receivingClinic || 'the clinic'} to confirm.`;

      try {
        if (patient.phone) {
          let phone = patient.phone.trim();
          if (!phone.startsWith('+')) phone = `+63${phone.replace(/\D/g, '').slice(-10)}`;
          await sendSMS({ to: phone, message: patientMsg });
        }

        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: `Referral Follow-Up Reminder – ${followUpDateStr}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Referral Follow-Up Reminder</h2>
                <p>Dear ${patient.firstName} ${patient.lastName},</p>
                <p>Your referral (Code: <strong>${referral.referralCode}</strong>) has a
                   scheduled follow-up on <strong>${followUpDateStr}</strong>.</p>
                <p>Reason for referral: ${referral.reason}</p>
                <p>Please contact your provider to confirm the appointment.</p>
              </div>
            `,
          });
        }

        await createNotification({
          type: 'referral_followup_reminder',
          title: 'Referral Follow-Up Due',
          message: patientMsg,
          patientId: patient._id,
          tenantId: referral.tenantId,
          metadata: { referralId: referral._id, referralCode: referral.referralCode, followUpDate: referral.followUpDate },
        } as any);

        result.reminders.sent++;
      } catch (err: unknown) {
        result.reminders.failed++;
        result.errors.push(`Reminder ${referral.referralCode}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`Reminder query: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Escalate stale pending referrals ─────────────────────────────────
  try {
    const escalationCutoff = new Date(now);
    escalationCutoff.setDate(escalationCutoff.getDate() - ESCALATION_DAYS);

    const staleReferrals = await Referral.find({
      ...tenantFilter,
      status: 'pending',
      urgency: { $in: ['urgent', 'stat'] },
      referredDate: { $lte: escalationCutoff },
    })
      .populate('patient', 'firstName lastName')
      .populate('referringDoctor', 'firstName lastName email');

    for (const referral of staleReferrals) {
      result.escalations.processed++;

      const doctor = referral.referringDoctor as any;
      const patient = referral.patient as any;
      if (!doctor?.email) continue;

      try {
        await sendEmail({
          to: doctor.email,
          subject: `[ESCALATION] Referral ${referral.referralCode} Pending ${ESCALATION_DAYS}+ Days`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto">
              <h2 style="color:#c0392b">Referral Escalation Notice</h2>
              <p>Dear Dr. ${doctor.firstName} ${doctor.lastName},</p>
              <p>The following <strong>${referral.urgency.toUpperCase()}</strong> referral has been
                 pending for more than ${ESCALATION_DAYS} days without acceptance:</p>
              <ul>
                <li><strong>Code:</strong> ${referral.referralCode}</li>
                <li><strong>Patient:</strong> ${patient?.firstName} ${patient?.lastName}</li>
                <li><strong>Reason:</strong> ${referral.reason}</li>
                <li><strong>Referred on:</strong> ${referral.referredDate.toLocaleDateString('en-PH')}</li>
              </ul>
              <p>Please follow up with the receiving provider.</p>
            </div>
          `,
        });

        await createNotification({
          type: 'referral_escalation',
          title: 'Referral Escalation',
          message: `Referral ${referral.referralCode} for ${patient?.firstName} ${patient?.lastName} has been pending ${ESCALATION_DAYS}+ days.`,
          tenantId: referral.tenantId,
          metadata: { referralId: referral._id, referralCode: referral.referralCode, urgency: referral.urgency },
        } as any);

        result.escalations.sent++;
      } catch (err: unknown) {
        result.escalations.failed++;
        result.errors.push(`Escalation ${referral.referralCode}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`Escalation query: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
