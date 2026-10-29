// Medication Adherence Tracking Automation
// Tracks and reminds patients about medication schedules

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { hourInTz, formatInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, delivered, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

export interface MedicationReminderOptions {
  prescriptionId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Clinic-local hours at which reminders go out. Only waking hours, so the cron
 * (vercel.json: 08/12/14/16/20 Manila) never texts patients at night.
 */
export const MEDICATION_REMINDER_HOURS = [8, 12, 14, 16, 20];

function parseFrequencyToTimesPerDay(frequency?: string): number {
  if (!frequency) return 1;

  const freq = frequency.toUpperCase();

  if (freq.includes('ONCE') || freq === 'QD' || freq === 'Q24H' || freq === 'OD') return 1;
  if (freq.includes('TWICE') || freq === 'BID' || freq === 'Q12H') return 2;
  if (freq.includes('THRICE') || freq.includes('THREE') || freq === 'TID' || freq === 'Q8H') return 3;
  if (freq.includes('FOUR') || freq === 'QID' || freq === 'Q6H') return 4;

  return 1;
}

/** Reminder hours (clinic-local) for a dosing frequency. */
function calculateReminderHours(timesPerDay: number): number[] {
  if (timesPerDay === 2) return [8, 20];
  if (timesPerDay === 3) return [8, 14, 20];
  if (timesPerDay >= 4) return [8, 12, 16, 20];
  return [8];
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

    if (!options.tenantId) {
      return { success: false, sent: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoMedicationAdherence')) {
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

    const medication = prescription.medications?.[0];
    if (!medication) {
      return { success: true, sent: false };
    }

    const clinicName = settings.clinicName || 'Clinic';
    let sent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const smsResult = await sendSMS({ to: patient.phone, message: generateMedicationReminderSMS(medication, clinicName) });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending medication reminder SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateMedicationReminderEmail(prescription, medication);
        const emailResult = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending medication reminder email:', error);
      }
    }

    // Patients have no User account, so no in-app notification is created here.
    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending medication reminder:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send medication reminder',
    };
  }
}

type AdherenceResult = {
  success: boolean;
  processed: number;
  remindersSent: number;
  errors: number;
  results: Array<{ prescriptionId: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant, now: Date): Promise<AdherenceResult> {
  const out: AdherenceResult = { success: true, processed: 0, remindersSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoMedicationAdherence')) return out;

  const currentHour = hourInTz(now, tenant.timezone);
  if (!MEDICATION_REMINDER_HOURS.includes(currentHour)) return out;
  const slotKey = `${formatInTz(now, 'yyyy-MM-dd', tenant.timezone)} ${String(currentHour).padStart(2, '0')}`;

  // Courses longer than 90 days are treated as maintenance and not texted several times a day.
  const earliestIssued = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const prescriptions = await Prescription.find({
    tenantId: tenant.tenantObjectId,
    status: 'active',
    issuedAt: { $lte: now, $gte: earliestIssued },
    lastMedicationReminderSlot: { $ne: slotKey },
  })
    .select('_id issuedAt medications')
    .sort({ issuedAt: -1 })
    .limit(BATCH_LIMIT * 4)
    .lean();

  for (const prescription of prescriptions as any[]) {
    const medication = prescription.medications?.[0];
    if (!medication?.frequency) continue;

    const durationDays = medication.durationDays || 7;
    const endDate = new Date(new Date(prescription.issuedAt).getTime() + durationDays * 24 * 60 * 60 * 1000);
    if (now > endDate) continue;

    const reminderHours = calculateReminderHours(parseFrequencyToTimesPerDay(medication.frequency));
    if (!reminderHours.includes(currentHour)) continue;

    out.processed++;
    try {
      // Claim the slot first so a rerun within the same hour never double-sends.
      const claim = await Prescription.updateOne(
        { _id: prescription._id, tenantId: tenant.tenantObjectId, lastMedicationReminderSlot: { $ne: slotKey } },
        { $set: { lastMedicationReminderSlot: slotKey } }
      );
      if (claim.modifiedCount === 0) continue;

      const result = await sendMedicationReminder({
        prescriptionId: prescription._id,
        tenantId: tenant.tenantObjectId,
        sendSMS: true,
        sendEmail: true,
      });
      out.results.push({ prescriptionId: String(prescription._id), success: result.success, error: result.error });
      if (result.success && result.sent) out.remindersSent++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ prescriptionId: String(prescription._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Send medication reminders for the current clinic-local hour slot.
 * Without a tenantId every active tenant is processed.
 */
export async function processMedicationReminders(
  tenantId?: string | Types.ObjectId,
  reminderTime?: Date
): Promise<AdherenceResult> {
  try {
    await connectDB();
    const now = reminderTime || new Date();
    const runs = await forEachTenant(tenantId, (t) => processTenant(t, now), { setting: 'autoMedicationAdherence' });
    const total: AdherenceResult = { success: runs.every((r) => r.success), processed: 0, remindersSent: 0, errors: 0, results: [] };
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
    console.error('Error processing medication reminders:', error);
    return {
      success: false,
      processed: 0,
      remindersSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateMedicationReminderSMS(medication: any, clinicName: string): string {
  return `Medication Reminder: Time to take ${medication.name}${medication.strength ? ` (${medication.strength})` : ''}${medication.instructions ? `. ${medication.instructions}` : ''}. - ${clinicName}`;
}

function generateMedicationReminderEmail(prescription: any, medication: any): { subject: string; html: string } {
  const patient = prescription.patient as any;
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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>This is a reminder to take your medication:</p>
          <div class="medication-box">
            <h2>${escapeHtml(medication.name)}</h2>
            ${medication.genericName ? `<p><strong>Generic Name:</strong> ${escapeHtml(medication.genericName)}</p>` : ''}
            ${medication.strength ? `<p><strong>Strength:</strong> ${escapeHtml(medication.strength)}</p>` : ''}
            ${medication.dose ? `<p><strong>Dose:</strong> ${escapeHtml(medication.dose)}</p>` : ''}
            ${medication.frequency ? `<p><strong>Frequency:</strong> ${escapeHtml(medication.frequency)}</p>` : ''}
            ${medication.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(medication.instructions)}</p>` : ''}
          </div>
          <p><strong>Prescription Code:</strong> ${escapeHtml(prescription.prescriptionCode)}</p>
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
