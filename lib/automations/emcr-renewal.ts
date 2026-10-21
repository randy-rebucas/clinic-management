import 'server-only';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { accountSessionSubject, type EmcrAccountLean } from '@/lib/emcr/account';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reminder steps: days before expiry ('0' = the day it expires). Each is sent once per expiry. */
export const RENEWAL_STEPS = [30, 7, 0] as const;

/** The step due for an expiry, or null: the smallest step whose window has opened. */
export function dueRenewalStep(expiresAt: Date, sent: string[], now = new Date()): number | null {
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  // Expired more than a week ago: stop reminding.
  if (daysLeft < -7) return null;
  const due = RENEWAL_STEPS.filter((step) => daysLeft <= step);
  const step = due.length ? Math.min(...due) : null;
  return step !== null && !sent.includes(String(step)) ? step : null;
}

function message(step: number, expiresAt: Date): { title: string; body: string } {
  const date = expiresAt.toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' });
  if (step === 0) {
    return {
      title: 'eMCR has expired',
      body: 'Your eMCR year has ended. Buy a renewal voucher at your clinic’s counter and enter the code in the app.',
    };
  }
  return {
    title: `eMCR ends in ${step} days`,
    body: `Your eMCR year ends on ${date}. Buy a renewal voucher at your clinic’s counter; the new year starts when this one ends.`,
  };
}

/**
 * Daily: remind account holders 30 and 7 days before their eMCR year ends and on the day it ends,
 * by push (their devices) and SMS (the account's phone). Each step goes out once per expiry;
 * redeeming a voucher resets the steps.
 */
export async function sendEmcrRenewalReminders(now = new Date()): Promise<{ checked: number; sent: number; errors: string[] }> {
  await connectDB();
  const accounts = await EmcrAccount.find({
    disabled: { $ne: true },
    'activation.expiresAt': { $gt: new Date(now.getTime() - 7 * DAY_MS), $lte: new Date(now.getTime() + 31 * DAY_MS) },
  })
    .limit(5000)
    .lean<EmcrAccountLean[]>();

  let sent = 0;
  const errors: string[] = [];
  for (const account of accounts) {
    const expiresAt = account.activation?.expiresAt ? new Date(account.activation.expiresAt) : null;
    if (!expiresAt) continue;
    const step = dueRenewalStep(expiresAt, account.activation?.remindersSent ?? [], now);
    if (step === null) continue;

    // Claim the step first, so overlapping runs never send it twice.
    const claimed = await EmcrAccount.updateOne(
      { _id: account._id, 'activation.expiresAt': expiresAt, 'activation.remindersSent': { $ne: String(step) } },
      { $addToSet: { 'activation.remindersSent': String(step) } }
    );
    if (!claimed.modifiedCount) continue;

    try {
      const text = message(step, expiresAt);
      const subject = await accountSessionSubject(account);
      if (subject) {
        await sendPushToPatientDevices(String(subject.patient._id), { ...text, tag: `emcr-renewal-${step}`, data: { screen: 'activate' } });
      }
      if (account.phone) await sendSMS({ to: account.phone, message: `${text.title}. ${text.body}` });
      sent++;
    } catch (error) {
      errors.push(String(account._id));
      logger.error('eMCR renewal reminder failed', error as Error, { accountId: String(account._id) });
    }
  }
  return { checked: accounts.length, sent, errors };
}
