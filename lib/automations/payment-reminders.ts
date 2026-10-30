// Payment Reminder Automation
// Sends reminders for outstanding invoice balances

import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  delivered,
  daysUntilInTz,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface PaymentReminderOptions {
  invoiceId?: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  daysOverdue?: number;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
  sendPush?: boolean;
}

/** Reminder schedule in days since the invoice: 7, 14, 30, then weekly until MAX_REMINDER_DAYS. */
export const FIRST_REMINDER_DAYS = 7;
const MAX_REMINDER_DAYS = 180;

/** The latest schedule level reached after `daysSinceInvoice` days, or null before the first. */
function dueReminderLevel(daysSinceInvoice: number): number | null {
  if (daysSinceInvoice < FIRST_REMINDER_DAYS) return null;
  if (daysSinceInvoice < 14) return FIRST_REMINDER_DAYS;
  if (daysSinceInvoice < 30) return 14;
  if (daysSinceInvoice > MAX_REMINDER_DAYS) return null;
  return 30 + Math.floor((daysSinceInvoice - 30) / 7) * 7;
}

function reminderLevelName(daysSinceInvoice: number): 'first' | 'second' | 'final' {
  if (daysSinceInvoice >= 30) return 'final';
  if (daysSinceInvoice >= 14) return 'second';
  return 'first';
}

/**
 * Send payment reminder for a specific invoice
 */
export async function sendPaymentReminder(options: PaymentReminderOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId || !options.invoiceId) {
      return { success: false, sent: false, error: 'Tenant and invoice are required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoPaymentReminders')) {
      return { success: true, sent: false };
    }

    const invoice = await Invoice.findOne({ _id: options.invoiceId, tenantId })
      .populate('patient', 'firstName lastName email phone')
      .populate('visit', 'visitCode date');

    if (!invoice) {
      return { success: false, sent: false, error: 'Invoice not found' };
    }
    if (!invoice.outstandingBalance || invoice.outstandingBalance <= 0 || invoice.status === 'paid') {
      return { success: true, sent: false };
    }

    const patient = invoice.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const tz = await getTenantTimezone(tenantId);
    const daysSinceInvoice = Math.max(0, -daysUntilInTz(invoice.createdAt, tz));
    const reminderLevel = reminderLevelName(daysSinceInvoice);

    let sent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const smsResult = await sendSMS({ to: patient.phone, message: generateReminderMessage(invoice, daysSinceInvoice, reminderLevel) });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending payment reminder SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateReminderEmail(invoice, daysSinceInvoice, reminderLevel, displayDate(invoice.createdAt, tz));
        const emailResult = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending payment reminder email:', error);
      }
    }

    if (options.sendPush !== false && patient._id) {
      try {
        const pushResult = await sendPushToPatientDevices(patient._id.toString(), {
          title: 'Payment Reminder',
          // No amount or invoice details: it shows on the lock screen.
          body: 'You have an unpaid balance. Tap to view your invoice.',
          tag: `invoice-${invoice._id}`,
          url: `/invoices/${invoice._id}`,
        }, { tenantId });
        if (pushResult.sent) sent = true;
      } catch (error) {
        console.error('Error sending payment reminder push notification:', error);
      }
    }

    // Patients have no User account, so no in-app notification is created here.
    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send payment reminder',
    };
  }
}

type PaymentRemindersResult = {
  success: boolean;
  processed: number;
  sent: number;
  errors: number;
  results: Array<{ invoiceId: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<PaymentRemindersResult> {
  const out: PaymentRemindersResult = { success: true, processed: 0, sent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoPaymentReminders')) return out;

  const now = new Date();
  const invoices = await Invoice.find({
    tenantId: tenant.tenantObjectId,
    status: { $in: ['unpaid', 'partial'] },
    outstandingBalance: { $gt: 0 },
    createdAt: {
      $lte: new Date(now.getTime() - FIRST_REMINDER_DAYS * 24 * 60 * 60 * 1000),
      $gte: new Date(now.getTime() - (MAX_REMINDER_DAYS + 1) * 24 * 60 * 60 * 1000),
    },
  })
    .select('_id createdAt paymentRemindersSent')
    .sort({ createdAt: 1 })
    .limit(BATCH_LIMIT * 4)
    .lean();

  for (const invoice of invoices as any[]) {
    const daysSinceInvoice = Math.max(0, -daysUntilInTz(invoice.createdAt, tenant.timezone, now));
    const level = dueReminderLevel(daysSinceInvoice);
    if (level === null) continue;
    if ((invoice.paymentRemindersSent || []).some((r: any) => r.level >= level)) continue;

    out.processed++;
    try {
      const result = await sendPaymentReminder({
        invoiceId: invoice._id,
        tenantId: tenant.tenantObjectId,
        daysOverdue: daysSinceInvoice,
        sendSMS: true,
        sendEmail: true,
      });
      out.results.push({ invoiceId: String(invoice._id), success: result.success, error: result.error });

      if (result.success && result.sent) {
        out.sent++;
        await Invoice.updateOne(
          { _id: invoice._id, tenantId: tenant.tenantObjectId },
          { $push: { paymentRemindersSent: { level, sentAt: new Date() } } }
        );
      } else if (!result.success) {
        out.errors++;
      }
    } catch (error) {
      out.errors++;
      out.results.push({ invoiceId: String(invoice._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process overdue invoices and send reminders (7, 14, 30 days, then weekly; each level once).
 * Without a tenantId every active tenant is processed.
 */
export async function processPaymentReminders(tenantId?: string | Types.ObjectId): Promise<PaymentRemindersResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoPaymentReminders' });
    const total: PaymentRemindersResult = { success: runs.every((r) => r.success), processed: 0, sent: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.sent += run.result.sent;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing payment reminders:', error);
    return {
      success: false,
      processed: 0,
      sent: 0,
      errors: 1,
      results: [],
    };
  }
}

/**
 * Generate reminder message for SMS
 */
function generateReminderMessage(
  invoice: any,
  daysOverdue: number,
  level: 'first' | 'second' | 'final'
): string {
  const patient = invoice.patient as any;
  const amount = invoice.outstandingBalance?.toFixed(2) || '0.00';
  const invoiceNumber = invoice.invoiceNumber;

  let message = `Dear ${patient.firstName}, `;

  if (level === 'final') {
    message += `URGENT: Your invoice ${invoiceNumber} has an outstanding balance of ${amount}. This is a final notice. Please settle immediately to avoid service interruption.`;
  } else if (level === 'second') {
    message += `Reminder: Your invoice ${invoiceNumber} has an outstanding balance of ${amount} (${daysOverdue} days overdue). Please settle your account soon.`;
  } else {
    message += `Friendly reminder: Your invoice ${invoiceNumber} has an outstanding balance of ${amount}. Please settle at your convenience.`;
  }

  return message;
}

/**
 * Generate reminder email
 */
function generateReminderEmail(
  invoice: any,
  daysOverdue: number,
  level: 'first' | 'second' | 'final',
  invoiceDateText: string
): { subject: string; html: string } {
  const patient = invoice.patient as any;
  const amount = invoice.outstandingBalance?.toFixed(2) || '0.00';
  const invoiceNumber = invoice.invoiceNumber;

  let subject = '';
  let urgencyColor = '#4CAF50';
  let urgencyText = '';

  if (level === 'final') {
    subject = `URGENT: Final Payment Notice - Invoice ${invoiceNumber}`;
    urgencyColor = '#f44336';
    urgencyText = 'FINAL NOTICE';
  } else if (level === 'second') {
    subject = `Payment Reminder - Invoice ${invoiceNumber} (${daysOverdue} days overdue)`;
    urgencyColor = '#ff9800';
    urgencyText = 'SECOND REMINDER';
  } else {
    subject = `Payment Reminder - Invoice ${invoiceNumber}`;
    urgencyColor = '#2196F3';
    urgencyText = 'FRIENDLY REMINDER';
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${urgencyColor}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid ${urgencyColor}; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .amount { font-size: 1.5em; font-weight: bold; color: ${urgencyColor}; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${urgencyText}</h1>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          ${level === 'final' 
            ? '<p><strong>This is a final notice regarding your outstanding balance.</strong></p>'
            : '<p>This is a reminder regarding your outstanding invoice balance.</p>'
          }
          <div class="info-box">
            <p><strong>Invoice Number:</strong> ${escapeHtml(invoiceNumber)}</p>
            <p><strong>Invoice Date:</strong> ${escapeHtml(invoiceDateText)}</p>
            <p><strong>Days Overdue:</strong> ${daysOverdue} days</p>
            <p class="amount">Outstanding Balance: ${amount}</p>
          </div>
          ${level === 'final' 
            ? '<p><strong>Please settle this amount immediately to avoid any service interruption.</strong></p>'
            : '<p>Please settle your account at your earliest convenience.</p>'
          }
          <p>If you have already made a payment, please ignore this reminder.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

