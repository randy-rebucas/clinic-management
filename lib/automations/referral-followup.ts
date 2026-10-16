// Referral Follow-Up Automation
// Reminds patients about pending referral follow-up dates.
// Also escalates referrals that have been pending too long.

import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import User from '@/models/User';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, safeNotify, displayDate, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

/** Days before follow-up date to send a reminder */
const REMINDER_DAYS_BEFORE = 3;

/** Days after referredDate before escalating a still-pending referral */
const ESCALATION_DAYS = 7;

export interface ReferralFollowUpResult {
  reminders: { processed: number; sent: number; failed: number };
  escalations: { processed: number; sent: number; failed: number };
  errors: string[];
}

async function processTenant(tenant: AutomationTenant): Promise<ReferralFollowUpResult> {
  const result: ReferralFollowUpResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    escalations: { processed: 0, sent: 0, failed: 0 },
    errors: [],
  };

  const tz = tenant.timezone;
  const tenantId = tenant.tenantObjectId;
  const now = new Date();

  // 1. Follow-up reminders: anything due within the next REMINDER_DAYS_BEFORE days, once.
  try {
    const referrals = await Referral.find({
      tenantId,
      followUpRequired: true,
      status: { $in: ['pending', 'accepted'] },
      followUpDate: { $gte: dayRangeInTz(now, tz).start, $lte: dayRangeOffsetInTz(REMINDER_DAYS_BEFORE, now, tz).end },
      followUpReminderSentAt: { $exists: false },
    })
      .populate('patient', 'firstName lastName email phone')
      .limit(BATCH_LIMIT);

    for (const referral of referrals) {
      result.reminders.processed++;
      const patient = referral.patient as any;
      if (!patient) continue;

      const followUpDateStr = displayDate(referral.followUpDate, tz);
      const patientMsg =
        `Hi ${patient.firstName}, a follow-up is scheduled for your referral ` +
        `(Ref: ${referral.referralCode}) on ${followUpDateStr}. ` +
        `Please contact ${referral.receivingClinic || 'the clinic'} to confirm.`;

      try {
        if (patient.phone) {
          await sendSMS({ to: patient.phone, message: patientMsg });
        }

        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: `Referral Follow-Up Reminder – ${followUpDateStr}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Referral Follow-Up Reminder</h2>
                <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
                <p>Your referral (Code: <strong>${escapeHtml(referral.referralCode)}</strong>) has a
                   scheduled follow-up on <strong>${escapeHtml(followUpDateStr)}</strong>.</p>
                <p>Reason for referral: ${escapeHtml(referral.reason)}</p>
                <p>Please contact your provider to confirm the appointment.</p>
              </div>
            `,
          });
        }

        result.reminders.sent++;
      } catch (err: unknown) {
        result.reminders.failed++;
        result.errors.push(`Reminder ${referral.referralCode}: ${errorMessage(err)}`);
      }

      await Referral.updateOne({ _id: referral._id, tenantId }, { $set: { followUpReminderSentAt: new Date() } }).catch((err) =>
        result.errors.push(`Marker ${referral.referralCode}: ${errorMessage(err)}`)
      );
    }
  } catch (err: unknown) {
    result.errors.push(`Reminder query: ${errorMessage(err)}`);
  }

  // 2. Escalate stale urgent referrals to the referring doctor, once per referral.
  try {
    const escalationCutoff = new Date(now.getTime() - ESCALATION_DAYS * 24 * 60 * 60 * 1000);

    const staleReferrals = await Referral.find({
      tenantId,
      status: 'pending',
      urgency: { $in: ['urgent', 'stat'] },
      referredDate: { $lte: escalationCutoff },
      escalationSentAt: { $exists: false },
    })
      .populate('patient', 'firstName lastName')
      .populate('referringDoctor', 'firstName lastName email')
      .limit(BATCH_LIMIT);

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
              <p>Dear Dr. ${escapeHtml(doctor.firstName)} ${escapeHtml(doctor.lastName)},</p>
              <p>The following <strong>${escapeHtml(String(referral.urgency).toUpperCase())}</strong> referral has been
                 pending for more than ${ESCALATION_DAYS} days without acceptance:</p>
              <ul>
                <li><strong>Code:</strong> ${escapeHtml(referral.referralCode)}</li>
                <li><strong>Patient:</strong> ${escapeHtml(patient?.firstName)} ${escapeHtml(patient?.lastName)}</li>
                <li><strong>Reason:</strong> ${escapeHtml(referral.reason)}</li>
                <li><strong>Referred on:</strong> ${escapeHtml(displayDate(referral.referredDate, tz))}</li>
              </ul>
              <p>Please follow up with the receiving provider.</p>
            </div>
          `,
        });

        // In-app notification only when the doctor has a linked user account.
        const doctorUser = await User.findOne({ tenantId, doctorProfile: doctor._id, status: 'active' }).select('_id').lean<any>();
        if (doctorUser) {
          await safeNotify({
            userId: doctorUser._id,
            tenantId,
            type: 'referral_escalation',
            priority: 'high',
            title: 'Referral Escalation',
            message: `Referral ${referral.referralCode} for ${patient?.firstName ?? ''} ${patient?.lastName ?? ''} has been pending ${ESCALATION_DAYS}+ days.`,
            metadata: { referralId: referral._id, referralCode: referral.referralCode, urgency: referral.urgency },
          });
        }

        result.escalations.sent++;
      } catch (err: unknown) {
        result.escalations.failed++;
        result.errors.push(`Escalation ${referral.referralCode}: ${errorMessage(err)}`);
      }

      await Referral.updateOne({ _id: referral._id, tenantId }, { $set: { escalationSentAt: new Date() } }).catch((err) =>
        result.errors.push(`Marker ${referral.referralCode}: ${errorMessage(err)}`)
      );
    }
  } catch (err: unknown) {
    result.errors.push(`Escalation query: ${errorMessage(err)}`);
  }

  return result;
}

/**
 * Process referral follow-up reminders and escalations.
 * Without a tenantId every active tenant is processed.
 */
export async function processReferralFollowUps(
  tenantId?: Types.ObjectId | string
): Promise<ReferralFollowUpResult> {
  await connectDB();

  const total: ReferralFollowUpResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    escalations: { processed: 0, sent: 0, failed: 0 },
    errors: [],
  };

  const runs = await forEachTenant(tenantId, processTenant);
  for (const run of runs) {
    if (!run.result) {
      total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    for (const k of ['reminders', 'escalations'] as const) {
      total[k].processed += run.result[k].processed;
      total[k].sent += run.result[k].sent;
      total[k].failed += run.result[k].failed;
    }
    total.errors.push(...run.result.errors);
  }

  return total;
}
