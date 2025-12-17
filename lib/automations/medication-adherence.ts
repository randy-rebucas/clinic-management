// Medication Adherence Tracking Automation
// Tracks and reminds patients about medication schedules

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface MedicationReminderOptions {
  prescriptionId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Parse frequency string to times per day
 */
function parseFrequencyToTimesPerDay(frequency?: string): number {
  if (!frequency) return 1;

  const freq = frequency.toUpperCase();
  
  if (freq.includes('ONCE') || freq === 'QD' || freq === 'Q24H') return 1;
  if (freq.includes('TWICE') || freq === 'BID' || freq === 'Q12H') return 2;
  if (freq.includes('THRICE') || freq === 'TID' || freq === 'Q8H') return 3;
  if (freq.includes('FOUR') || freq === 'QID' || freq === 'Q6H') return 4;
  if (freq.includes('FIVE') || freq === 'Q4H') return 5;
  if (freq.includes('SIX') || freq === 'Q4H') return 6;
  
  // Default to once if can't parse
  return 1;
}

/**
 * Calculate medication times based on frequency
 */
function calculateMedicationTimes(frequency?: string, startTime?: Date): Date[] {
  const timesPerDay = parseFrequencyToTimesPerDay(frequency);
  const times: Date[] = [];
  
  const baseTime = startTime || new Date();
  baseTime.setHours(8, 0, 0, 0); // Default to 8 AM start
  
  if (timesPerDay === 1) {
    times.push(new Date(baseTime));
  } else if (timesPerDay === 2) {
    times.push(new Date(baseTime)); // 8 AM
    times.push(new Date(baseTime.getTime() + 12 * 60 * 60 * 1000)); // 8 PM
  } else if (timesPerDay === 3) {
    times.push(new Date(baseTime)); // 8 AM
    times.push(new Date(baseTime.getTime() + 8 * 60 * 60 * 1000)); // 4 PM
    times.push(new Date(baseTime.getTime() + 16 * 60 * 60 * 1000)); // 12 AM next day
  } else if (timesPerDay === 4) {
    times.push(new Date(baseTime)); // 8 AM
    times.push(new Date(baseTime.getTime() + 6 * 60 * 60 * 1000)); // 2 PM
    times.push(new Date(baseTime.getTime() + 12 * 60 * 60 * 1000)); // 8 PM
    times.push(new Date(baseTime.getTime() + 18 * 60 * 60 * 1000)); // 2 AM next day
  }
  
  return times;
}

/**
 * Send medication reminder
 */
export async function sendMedicationReminder(options: MedicationReminderOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoMedicationAdherence = (settings.automationSettings as any)?.autoMedicationAdherence !== false;

    if (!autoMedicationAdherence) {
      return { success: true, sent: false };
    }

    const prescriptionId = typeof options.prescriptionId === 'string' 
      ? new Types.ObjectId(options.prescriptionId) 
      : options.prescriptionId;

    const prescription = await Prescription.findById(prescriptionId)
      .populate('patient', 'firstName lastName email phone')
      .populate('prescribedBy', 'firstName lastName');

    if (!prescription) {
      return { success: false, error: 'Prescription not found' };
    }

    // Only send reminders for active prescriptions
    if (prescription.status !== 'active') {
      return { success: true, sent: false };
    }

    const patient = prescription.patient as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : prescription.tenantId;

    // Get first medication for reminder
    const medication = prescription.medications?.[0];
    if (!medication) {
      return { success: true, sent: false };
    }

    const clinicName = settings.clinicName || 'Clinic';
    const reminderMessage = generateMedicationReminderSMS(medication, clinicName);
    const emailContent = generateMedicationReminderEmail(prescription, medication, settings);

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
        console.error('Error sending medication reminder SMS:', error);
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
        console.error('Error sending medication reminder email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'medication',
          priority: 'normal',
          title: 'Medication Reminder',
          message: `Time to take your medication: ${medication.name}`,
          relatedEntity: {
            type: 'prescription',
            id: prescription._id,
          },
          actionUrl: `/prescriptions/${prescription._id}`,
        });
        sent = true;
      } catch (error) {
        console.error('Error creating medication reminder notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending medication reminder:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send medication reminder' 
    };
  }
}

/**
 * Process all active prescriptions and send medication reminders
 * This should be called by a cron job multiple times per day
 */
export async function processMedicationReminders(
  tenantId?: string | Types.ObjectId,
  reminderTime?: Date
): Promise<{
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ prescriptionId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoMedicationAdherence = (settings.automationSettings as any)?.autoMedicationAdherence !== false;

    if (!autoMedicationAdherence) {
      return { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };
    }

    const now = reminderTime || new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Find active prescriptions
    const query: any = {
      status: 'active',
      issuedAt: { $lte: now }, // Prescription has been issued
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const prescriptions = await Prescription.find(query)
      .populate('patient', 'firstName lastName email phone');

    const results: Array<{ prescriptionId: string; success: boolean; error?: string }> = [];
    let remindersSent = 0;
    let errors = 0;

    for (const prescription of prescriptions) {
      // Check if prescription is still within duration
      const issuedDate = new Date(prescription.issuedAt);
      const durationDays = prescription.medications?.[0]?.durationDays || 7;
      const endDate = new Date(issuedDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      if (now > endDate) {
        continue; // Prescription duration has ended
      }

      // Check if it's time for a reminder based on frequency
      const medication = prescription.medications?.[0];
      if (!medication || !medication.frequency) {
        continue;
      }

      const timesPerDay = parseFrequencyToTimesPerDay(medication.frequency);
      const reminderHours = calculateReminderHours(timesPerDay);

      // Check if current time matches any reminder time (within 30 minutes window)
      const shouldRemind = reminderHours.some(hour => {
        const timeDiff = Math.abs((currentHour * 60 + currentMinute) - (hour * 60));
        return timeDiff <= 30; // 30 minute window
      });

      if (!shouldRemind) {
        continue;
      }

      // Send reminder
      const result = await sendMedicationReminder({
        prescriptionId: prescription._id,
        tenantId: prescription.tenantId,
        sendSMS: true,
        sendEmail: true,
        sendNotification: true,
      });

      results.push({
        prescriptionId: prescription._id.toString(),
        success: result.success,
        error: result.error,
      });

      if (result.success && result.sent) {
        remindersSent++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: prescriptions.length,
      remindersSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing medication reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [{ prescriptionId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Calculate reminder hours based on times per day
 */
function calculateReminderHours(timesPerDay: number): number[] {
  if (timesPerDay === 1) return [8]; // 8 AM
  if (timesPerDay === 2) return [8, 20]; // 8 AM, 8 PM
  if (timesPerDay === 3) return [8, 16, 0]; // 8 AM, 4 PM, 12 AM
  if (timesPerDay === 4) return [8, 14, 20, 2]; // 8 AM, 2 PM, 8 PM, 2 AM
  return [8]; // Default
}

/**
 * Generate medication reminder SMS
 */
function generateMedicationReminderSMS(medication: any, clinicName: string): string {
  return `Medication Reminder: Time to take ${medication.name}${medication.strength ? ` (${medication.strength})` : ''}${medication.instructions ? `. ${medication.instructions}` : ''}. - ${clinicName}`;
}

/**
 * Generate medication reminder email
 */
function generateMedicationReminderEmail(
  prescription: any,
  medication: any,
  settings: any
): { subject: string; html: string } {
  const patient = prescription.patient as any;
  const clinicName = settings.clinicName || 'Clinic';

  const subject = `Medication Reminder - ${medication.name}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .medication-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #FF9800; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Medication Reminder</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>This is a reminder to take your medication:</p>
          <div class="medication-box">
            <h2>${medication.name}</h2>
            ${medication.genericName ? `<p><strong>Generic Name:</strong> ${medication.genericName}</p>` : ''}
            ${medication.strength ? `<p><strong>Strength:</strong> ${medication.strength}</p>` : ''}
            ${medication.dose ? `<p><strong>Dose:</strong> ${medication.dose}</p>` : ''}
            ${medication.frequency ? `<p><strong>Frequency:</strong> ${medication.frequency}</p>` : ''}
            ${medication.instructions ? `<p><strong>Instructions:</strong> ${medication.instructions}</p>` : ''}
          </div>
          <p><strong>Prescription Code:</strong> ${prescription.prescriptionCode}</p>
          <p>Please take your medication as prescribed. If you have any questions, please contact the clinic.</p>
        </div>
        <div class="footer">
          <p>This is an automated reminder. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

