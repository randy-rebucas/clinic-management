// Prescription Expiry Warnings Automation
// Alerts patients before prescriptions expire

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  delivered,
  pendingThreshold,
  daysUntilInTz,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface PrescriptionExpiryWarning {
  prescriptionId: Types.ObjectId;
  prescription: any;
  patient: any;
  expiryDate: Date;
  daysUntilExpiry: number;
  warningLevel: 'urgent' | 'warning' | 'reminder';
}

/** Days before expiry at which a warning is sent (each once). */
const WARNING_THRESHOLDS = [7, 3, 1];
const MAX_COURSE_DAYS = 365;

/**
 * Calculate prescription expiry date from issued date and duration
 */
function calculateExpiryDate(prescription: any): Date | null {
  const issuedAt = prescription.issuedAt;
  if (!issuedAt) return null;

  let maxDuration = 0;
  for (const med of prescription.medications || []) {
    if (med.durationDays && med.durationDays > maxDuration) {
      maxDuration = med.durationDays;
    }
  }
  if (maxDuration === 0) maxDuration = 30;

  return new Date(new Date(issuedAt).getTime() + maxDuration * 24 * 60 * 60 * 1000);
}

function determineWarningLevel(daysUntilExpiry: number): 'urgent' | 'warning' | 'reminder' {
  if (daysUntilExpiry <= 1) return 'urgent';
  if (daysUntilExpiry <= 3) return 'warning';
  return 'reminder';
}

async function sendExpiryWarning(
  warning: PrescriptionExpiryWarning,
  tz: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    const patient = warning.patient;
    if (!patient) {
      return { sent: false, error: 'Patient not found' };
    }

    const prescription = warning.prescription;
    const prescriptionCode = prescription.prescriptionCode || 'N/A';
    const medicationNames = (prescription.medications || []).map((m: any) => m.name || 'Unknown').join(', ');

    let message = '';
    let subject = '';

    if (warning.warningLevel === 'urgent') {
      subject = `URGENT: Prescription Expiring Soon - ${prescriptionCode}`;
      message = `URGENT: Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Please contact the clinic to refill: ${medicationNames}`;
    } else if (warning.warningLevel === 'warning') {
      subject = `Prescription Expiring Soon - ${prescriptionCode}`;
      message = `Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Please contact the clinic to refill: ${medicationNames}`;
    } else {
      subject = `Prescription Expiry Reminder - ${prescriptionCode}`;
      message = `Reminder: Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Medications: ${medicationNames}`;
    }

    let sent = false;

    if (patient.phone) {
      try {
        const smsResult = await sendSMS({ to: patient.phone, message });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending prescription expiry SMS:', error);
      }
    }

    if (patient.email) {
      try {
        const emailHtml = `
          <h2>${escapeHtml(subject)}</h2>
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>${escapeHtml(message)}</p>
          <p><strong>Prescription Code:</strong> ${escapeHtml(prescriptionCode)}</p>
          <p><strong>Medications:</strong> ${escapeHtml(medicationNames)}</p>
          <p><strong>Expiry Date:</strong> ${escapeHtml(displayDate(warning.expiryDate, tz))}</p>
          <p>Please contact the clinic to schedule a refill if needed.</p>
        `;
        const emailResult = await sendEmail({ to: patient.email, subject, html: emailHtml });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending prescription expiry email:', error);
      }
    }

    // Patients have no User account, so no in-app notification is created here.
    return { sent };
  } catch (error: any) {
    console.error('Error sending prescription expiry warning:', error);
    return { sent: false, error: errorMessage(error) };
  }
}

type ExpiryWarningsResult = {
  success: boolean;
  processed: number;
  warningsSent: number;
  errors: number;
  warnings: PrescriptionExpiryWarning[];
};

async function processTenant(tenant: AutomationTenant): Promise<ExpiryWarningsResult> {
  const out: ExpiryWarningsResult = { success: true, processed: 0, warningsSent: 0, errors: 0, warnings: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoPrescriptionExpiryWarnings')) return out;

  const now = new Date();
  const prescriptions = await Prescription.find({
    tenantId: tenant.tenantObjectId,
    status: { $in: ['active', 'dispensed', 'partially-dispensed'] },
    issuedAt: { $gte: new Date(now.getTime() - MAX_COURSE_DAYS * 24 * 60 * 60 * 1000) },
  })
    .select('_id prescriptionCode issuedAt medications patient expiryWarningsSent')
    .populate('patient', 'firstName lastName email phone')
    .sort({ issuedAt: -1 })
    .limit(BATCH_LIMIT * 4);

  for (const prescription of prescriptions) {
    try {
      const expiryDate = calculateExpiryDate(prescription);
      if (!expiryDate) continue;

      const daysUntilExpiry = daysUntilInTz(expiryDate, tenant.timezone, now);
      if (daysUntilExpiry < 0) continue;

      const due = pendingThreshold(daysUntilExpiry, WARNING_THRESHOLDS, prescription.expiryWarningsSent);
      if (!due) continue;
      out.processed++;

      const warning: PrescriptionExpiryWarning = {
        prescriptionId: prescription._id as Types.ObjectId,
        prescription,
        patient: prescription.patient,
        expiryDate,
        daysUntilExpiry,
        warningLevel: determineWarningLevel(daysUntilExpiry),
      };

      const result = await sendExpiryWarning(warning, tenant.timezone);
      if (result.sent) {
        out.warningsSent++;
        await Prescription.updateOne(
          { _id: prescription._id, tenantId: tenant.tenantObjectId },
          { $addToSet: { expiryWarningsSent: { $each: due.crossed } } }
        );
      } else if (result.error) {
        out.errors++;
      }

      out.warnings.push({ ...warning, prescription: { _id: prescription._id, prescriptionCode: prescription.prescriptionCode }, patient: undefined });
    } catch (error) {
      out.errors++;
      console.error('[prescription-expiry] prescription failed:', errorMessage(error));
    }
  }

  return out;
}

/**
 * Process prescriptions and send expiry warnings (7, 3 and 1 day before; each once).
 * Without a tenantId every active tenant is processed.
 */
export async function processPrescriptionExpiryWarnings(
  tenantId?: string | Types.ObjectId
): Promise<ExpiryWarningsResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: ExpiryWarningsResult = { success: runs.every((r) => r.success), processed: 0, warningsSent: 0, errors: 0, warnings: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.warningsSent += run.result.warningsSent;
      total.errors += run.result.errors;
      total.warnings.push(...run.result.warnings);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing prescription expiry warnings:', error);
    return {
      success: false,
      processed: 0,
      warningsSent: 0,
      errors: 1,
      warnings: [],
    };
  }
}
