// Birthday Greetings Automation
// Sends birthday greetings to patients

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { formatInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, delivered, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

export interface BirthdayGreetingOptions {
  patientId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/** Don't greet the same patient twice within this many days (reruns, multi-day catch-up). */
const GREETING_COOLDOWN_DAYS = 300;

/**
 * Send birthday greeting to patient
 */
export async function sendBirthdayGreeting(options: BirthdayGreetingOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, sent: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoBirthdayGreetings')) {
      return { success: true, sent: false };
    }

    const patient = await Patient.findOne({ _id: options.patientId, tenantIds: tenantId });
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }
    if (!patient.dateOfBirth) {
      return { success: true, sent: false };
    }

    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const bookingUrl = `${baseUrl}/book`;

    let sent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const smsResult = await sendSMS({
          to: patient.phone,
          message: generateBirthdaySMS(patient, clinicName, bookingUrl),
        });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending birthday SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateBirthdayEmail(patient, settings, bookingUrl);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending birthday email:', error);
      }
    }

    if (sent) {
      await Patient.updateOne({ _id: patient._id }, { $set: { lastBirthdayGreetingAt: new Date() } });
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending birthday greeting:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send birthday greeting',
    };
  }
}

type BirthdayResult = {
  success: boolean;
  processed: number;
  greetingsSent: number;
  errors: number;
  results: Array<{ patientId: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<BirthdayResult> {
  const out: BirthdayResult = { success: true, processed: 0, greetingsSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoBirthdayGreetings')) return out;

  // Today and yesterday (clinic-local) so a missed run still greets the next day.
  const days = [0, -1].map((offset) => {
    const { start } = dayRangeOffsetInTz(offset, new Date(), tenant.timezone);
    return {
      month: Number(formatInTz(start, 'M', tenant.timezone)),
      day: Number(formatInTz(start, 'd', tenant.timezone)),
    };
  });

  const cooldown = new Date(Date.now() - GREETING_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const tz = tenant.timezone;

  const patients = await Patient.find({
    tenantIds: tenant.tenantObjectId,
    active: { $ne: false },
    dateOfBirth: { $exists: true, $ne: null },
    $and: [
      { $or: [{ lastBirthdayGreetingAt: { $exists: false } }, { lastBirthdayGreetingAt: null }, { lastBirthdayGreetingAt: { $lt: cooldown } }] },
      {
        $or: days.map(({ month, day }) => ({
          $expr: {
            $and: [
              { $eq: [{ $month: { date: '$dateOfBirth', timezone: tz } }, month] },
              { $eq: [{ $dayOfMonth: { date: '$dateOfBirth', timezone: tz } }, day] },
            ],
          },
        })),
      },
    ],
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();

  for (const patient of patients as any[]) {
    out.processed++;
    try {
      const result = await sendBirthdayGreeting({
        patientId: patient._id,
        tenantId: tenant.tenantObjectId,
        sendSMS: true,
        sendEmail: true,
        sendNotification: false,
      });
      out.results.push({ patientId: String(patient._id), success: result.success, error: result.error });
      if (result.success && result.sent) out.greetingsSent++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ patientId: String(patient._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process all patients with birthdays today and send greetings.
 * Without a tenantId every active tenant is processed.
 */
export async function processBirthdayGreetings(tenantId?: string | Types.ObjectId): Promise<BirthdayResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: BirthdayResult = { success: runs.every((r) => r.success), processed: 0, greetingsSent: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.greetingsSent += run.result.greetingsSent;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing birthday greetings:', error);
    return {
      success: false,
      processed: 0,
      greetingsSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateBirthdaySMS(patient: any, clinicName: string, bookingUrl: string): string {
  return `Happy Birthday ${patient.firstName}! 🎉 Wishing you a wonderful day and good health. As a special birthday gift, we're offering you a 10% discount on your next visit. Book now: ${bookingUrl}. - ${clinicName}`;
}

function generateBirthdayEmail(patient: any, settings: any, bookingUrl: string): { subject: string; html: string } {
  const clinicName = escapeHtml(settings.clinicName || 'Our Clinic');
  const clinicPhone = escapeHtml(settings.clinicPhone || '');
  const firstName = escapeHtml(patient.firstName);
  const lastName = escapeHtml(patient.lastName);
  const subject = `🎉 Happy Birthday ${patient.firstName}!`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .birthday-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
        .discount { font-size: 2em; font-weight: bold; color: #4CAF50; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Happy Birthday!</h1>
          <p>${firstName} ${lastName}</p>
        </div>
        <div class="content">
          <p>Dear ${firstName},</p>
          <p>We at ${clinicName} would like to wish you a very happy birthday! 🎂</p>
          <p>We hope your special day is filled with joy, happiness, and good health.</p>
          <div class="birthday-box">
            <h2>Special Birthday Offer</h2>
            <p class="discount">10% OFF</p>
            <p>on your next visit!</p>
            <p>Valid for 30 days from today</p>
          </div>
          <p>Take this opportunity to schedule your annual check-up or any health consultation you've been planning.</p>
          <p style="text-align: center;">
            <a href="${escapeHtml(bookingUrl)}" class="button">Book Your Appointment</a>
          </p>
          ${clinicPhone ? `<p>Or call us at ${clinicPhone} to schedule.</p>` : ''}
          <p>Thank you for being a valued patient. We look forward to serving you!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>Wishing you health and happiness,<br>The ${clinicName} Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}
