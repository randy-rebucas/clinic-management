// Health Check Reminders Automation
// Reminds patients of routine check-ups and preventive care

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById, listActivePatientsForAutomation, type PatientAutomationRow } from '@/lib/data/patient';
import { findMostRecentClosedCheckups } from '@/lib/data/visit';
import { getAutomationSettings, getOrCreateSettings } from '@/lib/data/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface HealthReminderOptions {
  patientId: string;
  reminderType: 'annual-checkup' | 'vaccination' | 'screening' | 'dental';
  tenantId?: string;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Calculate age from date of birth
 */
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

  // Annual check-up (every 12 months)
  reminders.push({
    type: 'annual-checkup',
    name: 'Annual Physical Exam',
    recommended: true,
    nextDue: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 365),
  });

  // Age-based screenings
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

  // Dental cleaning (every 6 months)
  reminders.push({
    type: 'dental',
    name: 'Dental Cleaning',
    recommended: true,
    nextDue: new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()),
  });

  return reminders;
}

/**
 * Send health reminder to patient
 */
export async function sendHealthReminder(options: HealthReminderOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoHealthReminders) {
      return { success: true, sent: false };
    }

    const patient = await run(tenantId, () => getPatientById(options.patientId));

    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const settings = await run(tenantId, () => getOrCreateSettings(tenantId));
    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const bookingUrl = `${baseUrl}/book`;

    const reminderMessage = generateHealthReminderSMS(options.reminderType, clinicName, bookingUrl);
    const emailContent = generateHealthReminderEmail(patient, options.reminderType, settings, bookingUrl);

    let sent = false;

    // Send SMS if enabled and phone available
    const phone = patient.phone || patient.contacts?.phone;
    if (options.sendSMS !== false && phone) {
      try {
        let phoneNumber = String(phone).trim();
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
        console.error('Error sending health reminder SMS:', error);
      }
    }

    // Send email if enabled and email available
    const email = patient.email || patient.contacts?.email;
    if (options.sendEmail !== false && email) {
      try {
        const emailResult = await sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending health reminder email:', error);
      }
    }

    // Send in-app notification. Note: Notification.userId is a hard FK to
    // User, and patients have no linked User account — this call mirrors the
    // pre-migration Mongoose behavior (which had the same conceptual gap) and
    // is expected to fail gracefully here; caught below.
    if (options.sendNotification !== false && patient.id) {
      try {
        await run(tenantId, () =>
          createNotification({
            userId: patient.id,
            type: 'reminder',
            priority: 'normal',
            title: 'Health Check Reminder',
            message: emailContent.subject,
            actionUrl: bookingUrl,
          })
        );
        sent = true;
      } catch (error) {
        console.error('Error creating health reminder notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending health reminder:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send health reminder',
    };
  }
}

/**
 * Process all patients and send health reminders
 * This should be called by a cron job
 */
export async function processHealthReminders(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ patientId: string; reminderType: string; success: boolean; error?: string }>;
}> {
  try {
    const resolvedTenantId = tenantId ?? null;

    const automationSettings = await run(resolvedTenantId, () => getAutomationSettings(resolvedTenantId));
    if (!automationSettings.autoHealthReminders) {
      return { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };
    }

    const allPatients = await run(resolvedTenantId, () => listActivePatientsForAutomation());
    const patients = allPatients.filter((p: PatientAutomationRow) => p.dateOfBirth);

    const results: Array<{ patientId: string; reminderType: string; success: boolean; error?: string }> = [];
    let remindersSent = 0;
    let errors = 0;

    // Get recent closed checkup visits to check last check-up date
    const patientIds = patients.map((p) => p.id);
    const lastCheckups = await run(resolvedTenantId, () => findMostRecentClosedCheckups(patientIds));

    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    for (const patient of patients) {
      const lastCheckup = lastCheckups.get(patient.id);

      // Send annual check-up reminder if no check-up in last year
      if (!lastCheckup || lastCheckup < oneYearAgo) {
        const result = await sendHealthReminder({
          patientId: patient.id,
          reminderType: 'annual-checkup',
          tenantId: resolvedTenantId ?? undefined,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          patientId: patient.id,
          reminderType: 'annual-checkup',
          success: result.success,
          error: result.error,
        });

        if (result.success && result.sent) {
          remindersSent++;
        } else if (!result.success) {
          errors++;
        }
      }
    }

    return {
      success: true,
      processed: patients.length,
      remindersSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing health reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [{ patientId: 'unknown', reminderType: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate health reminder SMS
 */
function generateHealthReminderSMS(reminderType: string, clinicName: string, bookingUrl: string): string {
  const messages: Record<string, string> = {
    'annual-checkup': `Reminder: It's time for your annual check-up! Regular health screenings are important for maintaining good health. Book now: ${bookingUrl} - ${clinicName}`,
    'vaccination': `Reminder: It's time for your vaccination. Stay protected and healthy. Book now: ${bookingUrl} - ${clinicName}`,
    'screening': `Reminder: It's time for your recommended health screening. Early detection saves lives. Book now: ${bookingUrl} - ${clinicName}`,
    'dental': `Reminder: It's time for your dental cleaning. Maintain your oral health. Book now: ${bookingUrl} - ${clinicName}`,
  };

  return messages[reminderType] || `Reminder: It's time for your health check-up. Book now: ${bookingUrl} - ${clinicName}`;
}

/**
 * Generate health reminder email
 */
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
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
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
            <a href="${bookingUrl}" class="button">Schedule Your Appointment</a>
          </p>
          ${clinicPhone ? `<p>Or call us at ${clinicPhone} to schedule.</p>` : ''}
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
