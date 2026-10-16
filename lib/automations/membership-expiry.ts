// Membership Expiry Automation
// Sends renewal reminders before membership expires and auto-expires past-due memberships.

import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  pendingThreshold,
  daysUntilInTz,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

const REMINDER_DAYS = [30, 14, 7, 3, 1]; // Days before expiry to send reminders

export interface MembershipExpiryResult {
  reminders: {
    processed: number;
    sent: number;
    failed: number;
  };
  expired: {
    processed: number;
    updated: number;
  };
  errors: string[];
}

async function processTenant(tenant: AutomationTenant): Promise<MembershipExpiryResult> {
  const result: MembershipExpiryResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    expired: { processed: 0, updated: 0 },
    errors: [],
  };

  const tz = tenant.timezone;
  const now = new Date();

  // 1. Reminders for upcoming expiries (each threshold once; a missed run catches up)
  try {
    const maxReminderDate = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    const memberships = await Membership.find({
      tenantId: tenant.tenantObjectId,
      status: 'active',
      expiryDate: { $gte: now, $lte: maxReminderDate },
    })
      .populate('patient', 'firstName lastName email phone')
      .sort({ expiryDate: 1 })
      .limit(BATCH_LIMIT);

    for (const membership of memberships) {
      result.reminders.processed++;

      const patient = membership.patient as any;
      if (!patient || !membership.expiryDate) continue;

      const expiryDate = membership.expiryDate;
      const daysUntilExpiry = daysUntilInTz(expiryDate, tz, now);
      const sameExpiry =
        membership.expiryRemindersFor && new Date(membership.expiryRemindersFor).getTime() === expiryDate.getTime();
      const sentLevels = sameExpiry ? membership.expiryRemindersSent || [] : [];
      const due = pendingThreshold(daysUntilExpiry, REMINDER_DAYS, sentLevels);
      if (!due) continue;

      const tier = String(membership.tier || '').toUpperCase();
      const expiryStr = displayDate(expiryDate, tz);
      const dayWord = `day${daysUntilExpiry === 1 ? '' : 's'}`;

      const smsMessage =
        `Hi ${patient.firstName}, your ${tier} membership ` +
        `(#${membership.membershipNumber}) expires on ${expiryStr} — ` +
        `${daysUntilExpiry} ${dayWord} left. ` +
        `Please contact us to renew.`;

      try {
        if (patient.phone) {
          await sendSMS({ to: patient.phone, message: smsMessage });
        }

        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: `Membership Renewal Reminder – ${daysUntilExpiry} ${dayWord === 'day' ? 'Day' : 'Days'} Left`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Membership Renewal Reminder</h2>
                <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
                <p>Your <strong>${escapeHtml(tier)} membership</strong>
                   (#${escapeHtml(membership.membershipNumber)}) will expire on
                   <strong>${escapeHtml(expiryStr)}</strong>
                   (${daysUntilExpiry} ${dayWord} from now).</p>
                <p>Current points balance: <strong>${Number(membership.points) || 0} pts</strong></p>
                <p>Please contact the clinic or visit our portal to renew your membership and
                   keep enjoying your benefits.</p>
                <p>Thank you for being a valued member.</p>
              </div>
            `,
          });
        }

        // Patients have no User account, so no in-app notification is created here.
        result.reminders.sent++;
      } catch (err: unknown) {
        result.reminders.failed++;
        result.errors.push(`Reminder for patient ${patient._id}: ${errorMessage(err)}`);
      }

      try {
        await Membership.updateOne(
          { _id: membership._id, tenantId: tenant.tenantObjectId },
          {
            $set: {
              expiryRemindersSent: Array.from(new Set([...sentLevels, ...due.crossed])),
              expiryRemindersFor: expiryDate,
            },
          }
        );
      } catch (err) {
        result.errors.push(`Marker for membership ${membership._id}: ${errorMessage(err)}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`Reminder query failed: ${errorMessage(err)}`);
  }

  // 2. Auto-expire past-due memberships
  try {
    const expired = await Membership.updateMany(
      { tenantId: tenant.tenantObjectId, status: 'active', expiryDate: { $lt: now } },
      { $set: { status: 'expired' } }
    );
    result.expired.processed = expired.matchedCount ?? 0;
    result.expired.updated = expired.modifiedCount ?? 0;
  } catch (err: unknown) {
    result.errors.push(`Auto-expire failed: ${errorMessage(err)}`);
  }

  return result;
}

/**
 * Send renewal reminders for memberships expiring soon.
 * Without a tenantId every active tenant is processed.
 */
export async function sendMembershipExpiryReminders(
  tenantId?: Types.ObjectId | string
): Promise<MembershipExpiryResult> {
  await connectDB();

  const total: MembershipExpiryResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    expired: { processed: 0, updated: 0 },
    errors: [],
  };

  const runs = await forEachTenant(tenantId, processTenant);
  for (const run of runs) {
    if (!run.result) {
      total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    total.reminders.processed += run.result.reminders.processed;
    total.reminders.sent += run.result.reminders.sent;
    total.reminders.failed += run.result.reminders.failed;
    total.expired.processed += run.result.expired.processed;
    total.expired.updated += run.result.expired.updated;
    total.errors.push(...run.result.errors);
  }

  return total;
}
