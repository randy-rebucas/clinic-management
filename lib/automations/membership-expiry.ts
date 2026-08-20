// Membership Expiry Automation
// Sends renewal reminders before membership expires and auto-expires past-due memberships.

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import prisma from '@/lib/prisma';
import { listMemberships } from '@/lib/data/membership';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

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
  tenantId?: any
): Promise<MembershipExpiryResult> {
  const result: MembershipExpiryResult = {
    reminders: { processed: 0, sent: 0, failed: 0 },
    expired: { processed: 0, updated: 0 },
    errors: [],
  };

  const now = new Date();

  try {
    await run(tenantId, async () => {
      // ── 1. Send reminders for upcoming expiries ──────────────────────────────
      try {
        // Build date ranges: any membership expiring within the next 30 days
        const maxReminderDate = new Date(now);
        maxReminderDate.setDate(maxReminderDate.getDate() + 30);

        const memberships = await listMemberships({
          status: 'active',
          expiryDate: { gte: now, lte: maxReminderDate },
        } as any);

        for (const membership of memberships) {
          result.reminders.processed++;

          const patient = (membership as any).patient;
          if (!patient) continue;

          const expiryDate = (membership as any).expiryDate!;
          const daysUntilExpiry = Math.ceil(
            (new Date(expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Only notify on specific day milestones
          if (!REMINDER_DAYS.includes(daysUntilExpiry)) continue;

          const patientName = `${patient.firstName} ${patient.lastName}`;
          const expiryStr = new Date(expiryDate).toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric',
          });

          const smsMessage =
            `Hi ${patient.firstName}, your ${(membership as any).tier.toUpperCase()} membership ` +
            `(#${(membership as any).membershipNumber}) expires on ${expiryStr} — ` +
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
                    <p>Your <strong>${(membership as any).tier.toUpperCase()} membership</strong>
                       (#${(membership as any).membershipNumber}) will expire on
                       <strong>${expiryStr}</strong>
                       (${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} from now).</p>
                    <p>Current points balance: <strong>${(membership as any).points} pts</strong></p>
                    <p>Please contact the clinic or visit our portal to renew your membership and
                       keep enjoying your benefits.</p>
                    <p>Thank you for being a valued member.</p>
                  </div>
                `,
              });
            }

            // In-app notification
            await createNotification({
              userId: patient.id,
              type: 'reminder',
              title: 'Membership Expiring Soon',
              message: smsMessage,
              tenantId: (membership as any).tenantId,
              metadata: {
                membershipId: (membership as any).id,
                membershipNumber: (membership as any).membershipNumber,
                tier: (membership as any).tier,
                daysUntilExpiry,
                expiryDate: new Date(expiryDate).toISOString(),
              },
            } as any);

            result.reminders.sent++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            result.reminders.failed++;
            result.errors.push(`Reminder for patient ${patient.id}: ${msg}`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Reminder query failed: ${msg}`);
      }

      // ── 2. Auto-expire past-due memberships ─────────────────────────────────
      try {
        const tid = tenantId ? String(tenantId) : undefined;
        const expired = await prisma.membership.updateMany({
          where: {
            ...(tid ? { tenantId: tid } : {}),
            status: 'active',
            expiryDate: { lt: now },
          },
          data: {
            status: 'expired',
            updatedAt: now,
          },
        });

        result.expired.processed = expired.count ?? 0;
        result.expired.updated = expired.count ?? 0;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Auto-expire failed: ${msg}`);
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Processing failed: ${msg}`);
  }

  return result;
}
