// Prescription Refill Reminder Automation
// Reminds patients to refill prescriptions

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  delivered,
  pendingThreshold,
  daysUntilInTz,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface PrescriptionRefillOptions {
  prescriptionId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/** Days before the refill date at which a reminder is sent (each once). */
const REFILL_THRESHOLDS = [3, 1, 0];

/**
 * Calculate refill date for a prescription
 */
export function calculateRefillDate(prescription: any): Date | null {
  if (!prescription.issuedAt) {
    return null;
  }

  let daysToAdd = 0;
  for (const medication of prescription.medications || []) {
    if (medication.durationDays) {
      daysToAdd = Math.max(daysToAdd, medication.durationDays);
    }
  }
  if (daysToAdd === 0) {
    daysToAdd = 30;
  }

  return new Date(new Date(prescription.issuedAt).getTime() + daysToAdd * 24 * 60 * 60 * 1000);
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

    if (!options.tenantId) {
      return { success: false, sent: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoPrescriptionRefills')) {
      return { success: true, sent: false };
    }

    const prescription = await Prescription.findOne({ _id: options.prescriptionId, tenantId })
      .populate('patient', 'firstName lastName email phone');

    if (!prescription) {
      return { success: false, sent: false, error: 'Prescription not found' };
    }
    if (prescription.status !== 'active') {
      return { success: true, sent: false };
    }

    const patient = prescription.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const refillDate = calculateRefillDate(prescription);
    if (!refillDate) {
      return { success: false, sent: false, error: 'Cannot calculate refill date' };
    }

    const tz = await getTenantTimezone(tenantId);
    const daysUntilRefill = Math.max(0, daysUntilInTz(refillDate, tz));
    if (daysUntilRefill > 3) {
      return { success: true, sent: false };
    }

    let sent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const smsResult = await sendSMS({ to: patient.phone, message: generateRefillMessage(prescription, daysUntilRefill) });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending refill reminder SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateRefillEmail(prescription, daysUntilRefill);
        const emailResult = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending refill reminder email:', error);
      }
    }

    // Patients have no User account, so no in-app notification is created here.
    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending refill reminder:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send refill reminder',
    };
  }
}

type RefillResult = {
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ prescriptionId: string; daysUntilRefill: number; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<RefillResult> {
  const out: RefillResult = { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoPrescriptionRefills')) return out;

  const now = new Date();
  const prescriptions = await Prescription.find({
    tenantId: tenant.tenantObjectId,
    status: 'active',
    issuedAt: { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) },
  })
    .select('_id issuedAt medications refillRemindersSent')
    .sort({ issuedAt: -1 })
    .limit(BATCH_LIMIT * 4)
    .lean();

  for (const prescription of prescriptions as any[]) {
    const refillDate = calculateRefillDate(prescription);
    if (!refillDate) continue;

    const daysUntilRefill = daysUntilInTz(refillDate, tenant.timezone, now);
    // A missed run still catches up, but only for refills that are at most a day overdue.
    if (daysUntilRefill < -1) continue;

    const due = pendingThreshold(Math.max(0, daysUntilRefill), REFILL_THRESHOLDS, prescription.refillRemindersSent);
    if (!due) continue;

    out.processed++;
    try {
      const result = await sendRefillReminder({
        prescriptionId: prescription._id,
        tenantId: tenant.tenantObjectId,
        sendSMS: true,
        sendEmail: true,
      });
      out.results.push({ prescriptionId: String(prescription._id), daysUntilRefill, success: result.success, error: result.error });

      if (result.success && result.sent) {
        out.remindersSent++;
        await Prescription.updateOne(
          { _id: prescription._id, tenantId: tenant.tenantObjectId },
          { $addToSet: { refillRemindersSent: { $each: due.crossed } } }
        );
      } else if (!result.success) {
        out.errors++;
      }
    } catch (error) {
      out.errors++;
      out.results.push({ prescriptionId: String(prescription._id), daysUntilRefill, success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process prescriptions and send refill reminders (3 days, 1 day and on the day; each once).
 * Without a tenantId every active tenant is processed.
 */
export async function processRefillReminders(tenantId?: string | Types.ObjectId): Promise<RefillResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoPrescriptionRefills' });
    const total: RefillResult = { success: runs.every((r) => r.success), processed: 0, remindersSent: 0, errors: 0, results: [] };
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
    console.error('Error processing refill reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateRefillMessage(prescription: any, daysUntilRefill: number): string {
  const medicationNames = prescription.medications?.map((med: any) => med.name).join(', ') || 'your medications';

  if (daysUntilRefill === 0) {
    return `URGENT: Your prescription for ${medicationNames} needs to be refilled today. Please contact the clinic to refill. Prescription Code: ${prescription.prescriptionCode}.`;
  } else if (daysUntilRefill === 1) {
    return `Reminder: Your prescription for ${medicationNames} needs to be refilled tomorrow. Please contact the clinic. Prescription Code: ${prescription.prescriptionCode}.`;
  }
  return `Reminder: Your prescription for ${medicationNames} will need to be refilled in ${daysUntilRefill} days. Please contact the clinic to refill. Prescription Code: ${prescription.prescriptionCode}.`;
}

function generateRefillEmail(prescription: any, daysUntilRefill: number): { subject: string; html: string } {
  const patient = prescription.patient as any;
  const medicationNames = prescription.medications?.map((med: any) => med.name).join(', ') || 'your medications';

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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          ${daysUntilRefill === 0
            ? '<p><strong>Your prescription needs to be refilled today.</strong></p>'
            : daysUntilRefill === 1
            ? '<p>Your prescription needs to be refilled tomorrow.</p>'
            : `<p>Your prescription will need to be refilled in ${daysUntilRefill} days.</p>`
          }
          <div class="info-box">
            <p><strong>Prescription Code:</strong> ${escapeHtml(prescription.prescriptionCode)}</p>
            <p><strong>Medications:</strong></p>
            <ul class="medications">
              ${prescription.medications?.map((med: any) => `
                <li>${escapeHtml(med.name)}${med.strength ? ` (${escapeHtml(med.strength)})` : ''}${med.instructions ? ` - ${escapeHtml(med.instructions)}` : ''}</li>
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
