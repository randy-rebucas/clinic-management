// Health Check Reminders Automation
// Reminds patients of routine check-ups and preventive care

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml, isEmailConfigured } from '@/lib/email';
import { sendSMS, isSMSConfigured } from '@/lib/sms';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, delivered, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

export interface HealthReminderOptions {
  patientId: string | Types.ObjectId;
  reminderType: 'annual-checkup' | 'vaccination' | 'screening' | 'dental';
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/** A patient gets at most one health reminder in this period. */
const REMINDER_INTERVAL_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Determine health reminders needed for a patient
 */
export function determineHealthReminders(patient: any): Array<{
  type: string;
  name: string;
  recommended: boolean;
  lastDate?: Date;
  nextDue?: Date;
}> {
  const reminders: Array<{
    type: string;
    name: string;
    recommended: boolean;
    lastDate?: Date;
    nextDue?: Date;
  }> = [];

  if (!patient.dateOfBirth) {
    return reminders;
  }

  const age = calculateAge(patient.dateOfBirth);
  const today = new Date();

  reminders.push({
    type: 'annual-checkup',
    name: 'Annual Physical Exam',
    recommended: true,
    nextDue: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 365),
  });

  if (age >= 50) {
    reminders.push({
      type: 'screening',
      name: 'Colonoscopy',
      recommended: true,
      nextDue: new Date(today.getFullYear() + 10, today.getMonth(), today.getDate()),
    });
  }

  if (patient.sex === 'female' && age >= 40) {
    reminders.push({
      type: 'screening',
      name: 'Mammogram',
      recommended: true,
      nextDue: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
    });
  }

  if (age >= 65) {
    reminders.push({
      type: 'vaccination',
      name: 'Pneumonia Vaccine',
      recommended: true,
      nextDue: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
    });
  }

  reminders.push({
    type: 'dental',
    name: 'Dental Cleaning',
    recommended: true,
    nextDue: new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()),
  });

  return reminders;
}

/**
 * Send health reminder to patient. Records `lastHealthReminderAt` once a send was attempted.
 */
export async function sendHealthReminder(options: HealthReminderOptions): Promise<{
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
    if (!automationEnabled(settings, 'autoHealthReminders')) {
      return { success: true, sent: false };
    }

    const patient = await Patient.findOne({ _id: options.patientId, tenantIds: tenantId });
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const bookingUrl = `${baseUrl}/book`;

    let sent = false;
    let attempted = false;

    if (options.sendSMS !== false && patient.phone && isSMSConfigured()) {
      attempted = true;
      try {
        const smsResult = await sendSMS({
          to: patient.phone,
          message: generateHealthReminderSMS(options.reminderType, clinicName, bookingUrl),
        });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending health reminder SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email && isEmailConfigured()) {
      attempted = true;
      try {
        const emailContent = generateHealthReminderEmail(patient, options.reminderType, settings, bookingUrl);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending health reminder email:', error);
      }
    }

    // Recorded on attempt (not only success) so unreachable patients don't block the queue daily.
    if (attempted) {
      await Patient.updateOne({ _id: patient._id }, { $set: { lastHealthReminderAt: new Date() } });
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending health reminder:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send health reminder',
    };
  }
}

type HealthResult = {
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ patientId: string; reminderType: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<HealthResult> {
  const out: HealthResult = { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoHealthReminders')) return out;
  if (!isSMSConfigured() && !isEmailConfigured()) return out;

  const now = Date.now();
  const oneYearAgo = new Date(now - 365 * DAY_MS);
  const remindedCutoff = new Date(now - REMINDER_INTERVAL_DAYS * DAY_MS);

  // Patients with a check-up in the last year don't need a reminder.
  const recentlyChecked = await Visit.distinct('patient', {
    tenantId: tenant.tenantObjectId,
    status: 'closed',
    visitType: 'checkup',
    date: { $gte: oneYearAgo },
  });

  const patients = await Patient.find({
    tenantIds: tenant.tenantObjectId,
    active: { $ne: false },
    dateOfBirth: { $exists: true, $ne: null },
    _id: { $nin: recentlyChecked },
    $and: [
      { $or: [{ lastHealthReminderAt: { $exists: false } }, { lastHealthReminderAt: null }, { lastHealthReminderAt: { $lt: remindedCutoff } }] },
      { $or: [{ phone: { $nin: [null, ''] } }, { email: { $nin: [null, ''] } }] },
    ],
  })
    .select('_id')
    .sort({ lastHealthReminderAt: 1, _id: 1 })
    .limit(BATCH_LIMIT)
    .lean();

  for (const patient of patients as any[]) {
    out.processed++;
    try {
      const result = await sendHealthReminder({
        patientId: patient._id,
        reminderType: 'annual-checkup',
        tenantId: tenant.tenantObjectId,
        sendSMS: true,
        sendEmail: true,
      });
      out.results.push({ patientId: String(patient._id), reminderType: 'annual-checkup', success: result.success, error: result.error });
      if (result.success && result.sent) out.remindersSent++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ patientId: String(patient._id), reminderType: 'annual-checkup', success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process patients and send health reminders (bounded per run; the rest follow on later runs).
 * Without a tenantId every active tenant is processed.
 */
export async function processHealthReminders(tenantId?: string | Types.ObjectId): Promise<HealthResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoHealthReminders' });
    const total: HealthResult = { success: runs.every((r) => r.success), processed: 0, remindersSent: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.remindersSent += run.result.remindersSent;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing health reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateHealthReminderSMS(reminderType: string, clinicName: string, bookingUrl: string): string {
  const messages: Record<string, string> = {
    'annual-checkup': `Reminder: It's time for your annual check-up! Regular health screenings are important for maintaining good health. Book now: ${bookingUrl} - ${clinicName}`,
    'vaccination': `Reminder: It's time for your vaccination. Stay protected and healthy. Book now: ${bookingUrl} - ${clinicName}`,
    'screening': `Reminder: It's time for your recommended health screening. Early detection saves lives. Book now: ${bookingUrl} - ${clinicName}`,
    'dental': `Reminder: It's time for your dental cleaning. Maintain your oral health. Book now: ${bookingUrl} - ${clinicName}`,
  };

  return messages[reminderType] || `Reminder: It's time for your health check-up. Book now: ${bookingUrl} - ${clinicName}`;
}

function generateHealthReminderEmail(
  patient: any,
  reminderType: string,
  settings: any,
  bookingUrl: string
): { subject: string; html: string } {
  const clinicPhone = settings.clinicPhone || '';

  const reminderNames: Record<string, { name: string; description: string }> = {
    'annual-checkup': {
      name: 'Annual Physical Exam',
      description: 'A comprehensive health check-up to assess your overall health and detect any potential issues early.',
    },
    'vaccination': {
      name: 'Vaccination',
      description: 'Stay protected with recommended vaccinations.',
    },
    'screening': {
      name: 'Health Screening',
      description: 'Recommended health screening based on your age and medical history.',
    },
    'dental': {
      name: 'Dental Cleaning',
      description: 'Regular dental cleanings are essential for maintaining good oral health.',
    },
  };

  const reminder = reminderNames[reminderType] || {
    name: 'Health Check-up',
    description: 'Regular health check-ups are important for maintaining good health.',
  };

  const subject = `Health Reminder: ${reminder.name}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Health Check Reminder</h1>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>This is a friendly reminder that it's time for your <strong>${reminder.name}</strong>.</p>
          <div class="info-box">
            <h2>${reminder.name}</h2>
            <p>${reminder.description}</p>
            <p>Regular health check-ups are essential for:</p>
            <ul>
              <li>Early detection of health issues</li>
              <li>Preventive care</li>
              <li>Maintaining optimal health</li>
              <li>Peace of mind</li>
            </ul>
          </div>
          <p style="text-align: center;">
            <a href="${escapeHtml(bookingUrl)}" class="button">Schedule Your Appointment</a>
          </p>
          ${clinicPhone ? `<p>Or call us at ${escapeHtml(clinicPhone)} to schedule.</p>` : ''}
          <p>Don't delay - your health is important!</p>
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
