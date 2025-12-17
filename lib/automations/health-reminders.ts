// Health Check Reminders Automation
// Reminds patients of routine check-ups and preventive care

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface HealthReminderOptions {
  patientId: string | Types.ObjectId;
  reminderType: 'annual-checkup' | 'vaccination' | 'screening' | 'dental';
  tenantId?: string | Types.ObjectId;
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
    await connectDB();

    const settings = await getSettings();
    const autoHealthReminders = (settings.automationSettings as any)?.autoHealthReminders !== false;

    if (!autoHealthReminders) {
      return { success: true, sent: false };
    }

    const patientId = typeof options.patientId === 'string' 
      ? new Types.ObjectId(options.patientId) 
      : options.patientId;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : patient.tenantId;

    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const bookingUrl = `${baseUrl}/book`;

    const reminderMessage = generateHealthReminderSMS(options.reminderType, clinicName, bookingUrl);
    const emailContent = generateHealthReminderEmail(patient, options.reminderType, settings, bookingUrl);

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
        console.error('Error sending health reminder SMS:', error);
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
        console.error('Error sending health reminder email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'reminder',
          priority: 'normal',
          title: 'Health Check Reminder',
          message: emailContent.subject,
          actionUrl: bookingUrl,
        });
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
      error: error.message || 'Failed to send health reminder' 
    };
  }
}

/**
 * Process all patients and send health reminders
 * This should be called by a cron job
 */
export async function processHealthReminders(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ patientId: string; reminderType: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoHealthReminders = (settings.automationSettings as any)?.autoHealthReminders !== false;

    if (!autoHealthReminders) {
      return { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };
    }

    // Get all active patients
    const query: any = {
      active: { $ne: false },
      dateOfBirth: { $exists: true, $ne: null },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const patients = await Patient.find(query);

    const results: Array<{ patientId: string; reminderType: string; success: boolean; error?: string }> = [];
    let remindersSent = 0;
    let errors = 0;

    // Get recent visits to check last check-up date
    const patientIds = patients.map(p => p._id);
    const recentVisits = await Visit.find({
      tenantId: tenantId || { $exists: true },
      patient: { $in: patientIds },
      status: 'closed',
      visitType: 'checkup',
    })
      .sort({ date: -1 })
      .exec();

    // Group visits by patient
    const lastCheckups = new Map<string, Date>();
    for (const visit of recentVisits) {
      const patientId = visit.patient.toString();
      if (!lastCheckups.has(patientId)) {
        lastCheckups.set(patientId, new Date(visit.date));
      }
    }

    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    for (const patient of patients) {
      const lastCheckup = lastCheckups.get(patient._id.toString());
      
      // Send annual check-up reminder if no check-up in last year
      if (!lastCheckup || lastCheckup < oneYearAgo) {
        const result = await sendHealthReminder({
          patientId: patient._id,
          reminderType: 'annual-checkup',
          tenantId: patient.tenantId,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          patientId: patient._id.toString(),
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
  const clinicName = settings.clinicName || 'Our Clinic';
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

