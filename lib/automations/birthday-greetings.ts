// Birthday Greetings Automation
// Sends birthday greetings to patients

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listActivePatientsForAutomation, getPatientById, type PatientAutomationRow } from '@/lib/data/patient';
import { getAutomationSettings } from '@/lib/data/settings';
import { getOrCreateSettings } from '@/lib/data/settings';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface BirthdayGreetingOptions {
  patientId: string;
  tenantId?: string;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send birthday greeting to patient
 */
export async function sendBirthdayGreeting(options: BirthdayGreetingOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoBirthdayGreetings) {
      return { success: true, sent: false };
    }

    const patient = await run(tenantId, () => getPatientById(options.patientId));

    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    if (!patient.dateOfBirth) {
      return { success: true, sent: false };
    }

    const settings = await run(tenantId, () => getOrCreateSettings(tenantId));
    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const bookingUrl = `${baseUrl}/book`;

    const greetingMessage = generateBirthdaySMS(patient, clinicName, bookingUrl);
    const emailContent = generateBirthdayEmail(patient, settings, bookingUrl);

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
          message: greetingMessage,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending birthday SMS:', error);
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
        console.error('Error sending birthday email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false) {
      // Note: Patient records have no linked User account (Notification.userId
      // is a hard FK to User), so there is no notification target here.
      // Could send to clinic staff instead if needed.
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending birthday greeting:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send birthday greeting',
    };
  }
}

/**
 * Process all patients with birthdays today and send greetings
 * This should be called by a cron job
 */
export async function processBirthdayGreetings(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  greetingsSent: number;
  errors: number;
  results: Array<{ patientId: string; success: boolean; error?: string }>;
}> {
  try {
    const resolvedTenantId = tenantId ?? null;

    const automationSettings = await run(resolvedTenantId, () => getAutomationSettings(resolvedTenantId));
    if (!automationSettings.autoBirthdayGreetings) {
      return { success: true, processed: 0, greetingsSent: 0, errors: 0, results: [] };
    }

    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const day = today.getDate();

    const patients = await run(resolvedTenantId, () => listActivePatientsForAutomation());

    const birthdayPatients = patients.filter((p: PatientAutomationRow) => {
      if (!p.dateOfBirth) return false;
      const dob = new Date(p.dateOfBirth);
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    const results: Array<{ patientId: string; success: boolean; error?: string }> = [];
    let greetingsSent = 0;
    let errors = 0;

    for (const patient of birthdayPatients) {
      const result = await sendBirthdayGreeting({
        patientId: patient.id,
        tenantId: resolvedTenantId ?? undefined,
        sendSMS: true,
        sendEmail: true,
        sendNotification: false,
      });

      results.push({
        patientId: patient.id,
        success: result.success,
        error: result.error,
      });

      if (result.success && result.sent) {
        greetingsSent++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: birthdayPatients.length,
      greetingsSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing birthday greetings:', error);
    return {
      success: false,
      processed: 0,
      greetingsSent: 0,
      errors: 1,
      results: [{ patientId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate birthday SMS
 */
function generateBirthdaySMS(patient: any, clinicName: string, bookingUrl: string): string {
  return `Happy Birthday ${patient.firstName}! 🎉 Wishing you a wonderful day and good health. As a special birthday gift, we're offering you a 10% discount on your next visit. Book now: ${bookingUrl}. - ${clinicName}`;
}

/**
 * Generate birthday email
 */
function generateBirthdayEmail(patient: any, settings: any, bookingUrl: string): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Our Clinic';
  const clinicPhone = settings.clinicPhone || '';
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
          <p>${patient.firstName} ${patient.lastName}</p>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName},</p>
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
            <a href="${bookingUrl}" class="button">Book Your Appointment</a>
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
