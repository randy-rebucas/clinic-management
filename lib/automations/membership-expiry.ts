// Membership Expiry Automation
// Sends renewal reminders before membership expires and auto-expires past-due memberships.

import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';

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

/**
 * Send renewal reminders for memberships expiring soon.
 */
export async function sendMembershipExpiryReminders(
  tenantId?: Types.ObjectId | string
): Promise<MembershipExpiryResult> {
  await connectDB();

  const result: MembershipExpiryResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    expired: { processed: 0, updated: 0 },
    errors: [],
  };

  const settings = await getSettings();
  const tenantFilter = tenantId
    ? { tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId }
    : {};

  const now = new Date();

  // ── 1. Send reminders for upcoming expiries ──────────────────────────────
  try {
    // Build date ranges: any membership expiring within the next 30 days
    const maxReminderDate = new Date(now);
    maxReminderDate.setDate(maxReminderDate.getDate() + 30);

    const memberships = await Membership.find({
      ...tenantFilter,
      status: 'active',
      expiryDate: { $gte: now, $lte: maxReminderDate },
    }).populate('patient', 'firstName lastName email phone');

    for (const membership of memberships) {
      result.reminders.processed++;

      const patient = membership.patient as any;
      if (!patient) continue;

      const expiryDate = membership.expiryDate!;
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Only notify on specific day milestones
      if (!REMINDER_DAYS.includes(daysUntilExpiry)) continue;

      const patientName = `${patient.firstName} ${patient.lastName}`;
      const expiryStr = expiryDate.toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      const smsMessage =
        `Hi ${patient.firstName}, your ${membership.tier.toUpperCase()} membership ` +
        `(#${membership.membershipNumber}) expires on ${expiryStr} — ` +
        `${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} left. ` +
        `Please contact us to renew.`;

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
            subject: `Membership Renewal Reminder – ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? '' : 's'} Left`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>Membership Renewal Reminder</h2>
                <p>Dear ${patientName},</p>
                <p>Your <strong>${membership.tier.toUpperCase()} membership</strong>
                   (#${membership.membershipNumber}) will expire on
                   <strong>${expiryStr}</strong>
                   (${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} from now).</p>
                <p>Current points balance: <strong>${membership.points} pts</strong></p>
                <p>Please contact the clinic or visit our portal to renew your membership and
                   keep enjoying your benefits.</p>
                <p>Thank you for being a valued member.</p>
              </div>
            `,
          });
        }

        // In-app notification
        await createNotification({
          type: 'membership_expiry_reminder',
          title: 'Membership Expiring Soon',
          message: smsMessage,
          patientId: patient._id,
          tenantId: membership.tenantId,
          metadata: {
            membershipId: membership._id,
            membershipNumber: membership.membershipNumber,
            tier: membership.tier,
            daysUntilExpiry,
            expiryDate: expiryDate.toISOString(),
          },
        } as any);

        result.reminders.sent++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.reminders.failed++;
        result.errors.push(`Reminder for patient ${patient._id}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Reminder query failed: ${msg}`);
  }

  // ── 2. Auto-expire past-due memberships ─────────────────────────────────
  try {
    const expired = await Membership.updateMany(
      {
        ...tenantFilter,
        status: 'active',
        expiryDate: { $lt: now },
      },
      {
        $set: {
          status: 'expired',
          updatedAt: now,
        },
      }
    );

    result.expired.processed = expired.matchedCount ?? 0;
    result.expired.updated = expired.modifiedCount ?? 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Auto-expire failed: ${msg}`);
  }

  return result;
}
