// Prescription Refill Reminder Automation
// Reminds patients to refill prescriptions

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface PrescriptionRefillOptions {
  prescriptionId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Calculate refill date for a prescription
 */
export function calculateRefillDate(prescription: any): Date | null {
  if (!prescription.issuedAt) {
    return null;
  }

  const issuedDate = new Date(prescription.issuedAt);
  let daysToAdd = 0;

  // Calculate based on medication duration
  for (const medication of prescription.medications || []) {
    if (medication.durationDays) {
      daysToAdd = Math.max(daysToAdd, medication.durationDays);
    }
  }

  // If no duration specified, default to 30 days
  if (daysToAdd === 0) {
    daysToAdd = 30;
  }

  const refillDate = new Date(issuedDate);
  refillDate.setDate(issuedDate.getDate() + daysToAdd);
  
  return refillDate;
}

/**
 * Send refill reminder for a prescription
 */
export async function sendRefillReminder(options: PrescriptionRefillOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoPrescriptionRefills = (settings.automationSettings as any)?.autoPrescriptionRefills !== false;

    if (!autoPrescriptionRefills) {
      return { success: true, sent: false };
    }

    const prescriptionId = typeof options.prescriptionId === 'string' 
      ? new Types.ObjectId(options.prescriptionId) 
      : options.prescriptionId;

    const prescription = await Prescription.findById(prescriptionId)
      .populate('patient', 'firstName lastName email phone')
      .populate('prescribedBy', 'name');

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

    const refillDate = calculateRefillDate(prescription);
    if (!refillDate) {
      return { success: false, error: 'Cannot calculate refill date' };
    }

    const today = new Date();
    const daysUntilRefill = Math.floor((refillDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Only send reminder if within 3 days of refill date
    if (daysUntilRefill > 3 || daysUntilRefill < 0) {
      return { success: true, sent: false };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : prescription.tenantId;

    const reminderMessage = generateRefillMessage(prescription, daysUntilRefill);
    const emailContent = generateRefillEmail(prescription, daysUntilRefill);

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
        console.error('Error sending refill reminder SMS:', error);
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
        console.error('Error sending refill reminder email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'prescription',
          priority: daysUntilRefill <= 1 ? 'high' : 'normal',
          title: 'Prescription Refill Reminder',
          message: reminderMessage,
          relatedEntity: {
            type: 'prescription',
            id: prescription._id,
          },
          actionUrl: `/prescriptions/${prescription._id}`,
        });
        sent = true;
      } catch (error) {
        console.error('Error creating refill reminder notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending refill reminder:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send refill reminder' 
    };
  }
}

/**
 * Process all prescriptions and send refill reminders
 * This should be called by a cron job
 */
export async function processRefillReminders(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ prescriptionId: string; daysUntilRefill: number; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoPrescriptionRefills = (settings.automationSettings as any)?.autoPrescriptionRefills !== false;

    if (!autoPrescriptionRefills) {
      return { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };
    }

    // Get all active prescriptions
    const query: any = {
      status: 'active',
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const prescriptions = await Prescription.find(query)
      .populate('patient', 'firstName lastName email phone');

    const results: Array<{ prescriptionId: string; daysUntilRefill: number; success: boolean; error?: string }> = [];
    let remindersSent = 0;
    let errors = 0;

    const today = new Date();

    for (const prescription of prescriptions) {
      const refillDate = calculateRefillDate(prescription);
      if (!refillDate) continue;

      const daysUntilRefill = Math.floor((refillDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Send reminders at 3 days and 1 day before refill date, and on refill date
      const shouldRemind = daysUntilRefill === 3 || daysUntilRefill === 1 || daysUntilRefill === 0;

      if (shouldRemind) {
        const result = await sendRefillReminder({
          prescriptionId: prescription._id,
          tenantId: prescription.tenantId,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          prescriptionId: prescription._id.toString(),
          daysUntilRefill,
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
      processed: prescriptions.length,
      remindersSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing refill reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [{ prescriptionId: 'unknown', daysUntilRefill: 0, success: false, error: error.message }],
    };
  }
}

/**
 * Generate refill reminder message
 */
function generateRefillMessage(prescription: any, daysUntilRefill: number): string {
  const patient = prescription.patient as any;
  const medicationNames = prescription.medications
    ?.map((med: any) => med.name)
    .join(', ') || 'your medications';

  if (daysUntilRefill === 0) {
    return `URGENT: Your prescription for ${medicationNames} needs to be refilled today. Please contact the clinic to refill. Prescription Code: ${prescription.prescriptionCode}.`;
  } else if (daysUntilRefill === 1) {
    return `Reminder: Your prescription for ${medicationNames} needs to be refilled tomorrow. Please contact the clinic. Prescription Code: ${prescription.prescriptionCode}.`;
  } else {
    return `Reminder: Your prescription for ${medicationNames} will need to be refilled in ${daysUntilRefill} days. Please contact the clinic to refill. Prescription Code: ${prescription.prescriptionCode}.`;
  }
}

/**
 * Generate refill reminder email
 */
function generateRefillEmail(prescription: any, daysUntilRefill: number): { subject: string; html: string } {
  const patient = prescription.patient as any;
  const medicationNames = prescription.medications
    ?.map((med: any) => med.name)
    .join(', ') || 'your medications';

  let subject = '';
  let urgencyColor = '#ff9800';
  let urgencyText = '';

  if (daysUntilRefill === 0) {
    subject = `URGENT: Prescription Refill Needed - ${medicationNames}`;
    urgencyColor = '#f44336';
    urgencyText = 'URGENT - REFILL TODAY';
  } else if (daysUntilRefill === 1) {
    subject = `Prescription Refill Reminder - ${medicationNames}`;
    urgencyColor = '#ff5722';
    urgencyText = 'REFILL TOMORROW';
  } else {
    subject = `Prescription Refill Reminder - ${medicationNames}`;
    urgencyColor = '#ff9800';
    urgencyText = 'REFILL REMINDER';
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
        .medications { list-style: none; padding: 0; }
        .medications li { padding: 5px 0; border-bottom: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${urgencyText}</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          ${daysUntilRefill === 0 
            ? '<p><strong>Your prescription needs to be refilled today.</strong></p>'
            : daysUntilRefill === 1
            ? '<p>Your prescription needs to be refilled tomorrow.</p>'
            : `<p>Your prescription will need to be refilled in ${daysUntilRefill} days.</p>`
          }
          <div class="info-box">
            <p><strong>Prescription Code:</strong> ${prescription.prescriptionCode}</p>
            <p><strong>Medications:</strong></p>
            <ul class="medications">
              ${prescription.medications?.map((med: any) => `
                <li>${med.name}${med.strength ? ` (${med.strength})` : ''}${med.instructions ? ` - ${med.instructions}` : ''}</li>
              `).join('') || '<li>No medications listed</li>'}
            </ul>
          </div>
          <p>Please contact the clinic to refill your prescription.</p>
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

