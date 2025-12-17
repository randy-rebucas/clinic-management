// Payment Reminder Automation
// Sends reminders for outstanding invoice balances

import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification, createInvoiceNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface PaymentReminderOptions {
  invoiceId?: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  daysOverdue?: number;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
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

    const settings = await getSettings();
    const autoPaymentReminders = (settings.automationSettings as any)?.autoPaymentReminders !== false;

    if (!autoPaymentReminders) {
      return { success: true, sent: false };
    }

    // Get invoice with patient
    const invoiceQuery: any = {};
    if (options.invoiceId) {
      invoiceQuery._id = typeof options.invoiceId === 'string' 
        ? new Types.ObjectId(options.invoiceId) 
        : options.invoiceId;
    }
    if (options.tenantId) {
      invoiceQuery.tenantId = typeof options.tenantId === 'string' 
        ? new Types.ObjectId(options.tenantId) 
        : options.tenantId;
    }

    const invoice = await Invoice.findOne(invoiceQuery)
      .populate('patient', 'firstName lastName email phone')
      .populate('visit', 'visitCode date');

    if (!invoice) {
      return { success: false, sent: false, error: 'Invoice not found' };
    }

    // Check if invoice has outstanding balance
    if (!invoice.outstandingBalance || invoice.outstandingBalance <= 0) {
      return { success: true, sent: false };
    }

    // Check if invoice is already paid
    if (invoice.status === 'paid') {
      return { success: true, sent: false };
    }

    const patient = invoice.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    // Calculate days overdue
    const invoiceDate = new Date(invoice.createdAt);
    const today = new Date();
    const daysSinceInvoice = Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determine reminder level based on days overdue
    let reminderLevel: 'first' | 'second' | 'final' = 'first';
    let urgency = 'normal';
    
    if (daysSinceInvoice >= 30) {
      reminderLevel = 'final';
      urgency = 'urgent';
    } else if (daysSinceInvoice >= 14) {
      reminderLevel = 'second';
      urgency = 'high';
    }

    const reminderMessage = generateReminderMessage(invoice, daysSinceInvoice, reminderLevel);
    const emailContent = generateReminderEmail(invoice, daysSinceInvoice, reminderLevel);

    let sent = false;

    // Send SMS if enabled and phone available
    if (options.sendSMS !== false && patient.phone) {
      try {
        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message: reminderMessage,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending payment reminder SMS:', error);
      }
    }

    // Send email if enabled and email available
    if (options.sendEmail !== false && patient.email) {
      try {
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending payment reminder email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createInvoiceNotification(patient._id, invoice);
        sent = true;
      } catch (error) {
        console.error('Error creating payment reminder notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    return { 
      success: false,
      sent: false,
      error: error.message || 'Failed to send payment reminder' 
    };
  }
}

/**
 * Process all overdue invoices and send reminders
 * This should be called by a cron job
 */
export async function processPaymentReminders(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  sent: number;
  errors: number;
  results: Array<{ invoiceId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoPaymentReminders = (settings.automationSettings as any)?.autoPaymentReminders !== false;

    if (!autoPaymentReminders) {
      return { success: true, processed: 0, sent: 0, errors: 0, results: [] };
    }

    // Build query for unpaid/partial invoices
    const query: any = {
      status: { $in: ['unpaid', 'partial'] },
      outstandingBalance: { $gt: 0 },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    // Get all invoices with outstanding balance
    const invoices = await Invoice.find(query)
      .populate('patient', 'firstName lastName email phone')
      .sort({ createdAt: 1 }); // Oldest first

    const results: Array<{ invoiceId: string; success: boolean; error?: string }> = [];
    let sent = 0;
    let errors = 0;

    for (const invoice of invoices) {
      const invoiceDate = new Date(invoice.createdAt);
      const today = new Date();
      const daysSinceInvoice = Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

      // Send reminders based on schedule:
      // - 7 days: First reminder
      // - 14 days: Second reminder
      // - 30 days: Final notice
      const shouldRemind = 
        (daysSinceInvoice === 7) || 
        (daysSinceInvoice === 14) || 
        (daysSinceInvoice === 30) ||
        (daysSinceInvoice > 30 && daysSinceInvoice % 7 === 0); // Weekly after 30 days

      if (shouldRemind) {
        const result = await sendPaymentReminder({
          invoiceId: invoice._id,
          tenantId: invoice.tenantId,
          daysOverdue: daysSinceInvoice,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          invoiceId: invoice._id.toString(),
          success: result.success,
          error: result.error,
        });

        if (result.success && result.sent) {
          sent++;
        } else if (!result.success) {
          errors++;
        }
      }
    }

    return {
      success: true,
      processed: invoices.length,
      sent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing payment reminders:', error);
    return {
      success: false,
      processed: 0,
      sent: 0,
      errors: 1,
      results: [{ invoiceId: 'unknown', success: false, error: error.message }],
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
  level: 'first' | 'second' | 'final'
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
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          ${level === 'final' 
            ? '<p><strong>This is a final notice regarding your outstanding balance.</strong></p>'
            : '<p>This is a reminder regarding your outstanding invoice balance.</p>'
          }
          <div class="info-box">
            <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
            <p><strong>Invoice Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
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

