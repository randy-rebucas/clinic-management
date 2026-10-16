// Patient Re-engagement Automation
// Identifies inactive patients (no visit in X months) and sends a friendly
// re-engagement message encouraging them to book an appointment.

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import { forEachTenant, errorMessage, type AutomationTenant } from './shared';

/** Patients with no visit for this many months are considered inactive */
const INACTIVE_MONTHS = 6;

/** A contacted patient is not contacted again for this many days. */
const RECONTACT_DAYS = 180;

/** Limit per tenant per run to avoid spamming and stay within rate limits */
const BATCH_LIMIT = 100;

export interface PatientReengagementResult {
  processed: number;
  contacted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function processTenant(tenant: AutomationTenant): Promise<PatientReengagementResult> {
  const result: PatientReengagementResult = { processed: 0, contacted: 0, skipped: 0, failed: 0, errors: [] };
  const tenantId = tenant.tenantObjectId;

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVE_MONTHS);
  const recontactCutoff = new Date(now.getTime() - RECONTACT_DAYS * 24 * 60 * 60 * 1000);

  const settings = await getSettings(tenant.tenantId);
  const clinicName = settings.clinicName || tenant.name || 'The Clinic';

  const [recentVisitPatientIds, recentApptPatientIds, pastVisitPatientIds] = await Promise.all([
    Visit.distinct('patient', { tenantId, date: { $gte: cutoffDate } }),
    Appointment.distinct('patient', {
      tenantId,
      $or: [{ appointmentDate: { $gte: cutoffDate } }, { scheduledAt: { $gte: cutoffDate } }],
      status: { $in: ['pending', 'scheduled', 'confirmed', 'completed'] },
    }),
    Visit.distinct('patient', { tenantId }),
  ]);

  const recentIds = new Set([...recentVisitPatientIds.map(String), ...recentApptPatientIds.map(String)]);
  // Patients who have visited before (not brand new) but not recently.
  const inactiveIds = pastVisitPatientIds.filter((id: unknown) => !recentIds.has(String(id)));
  if (inactiveIds.length === 0) return result;

  const patients = await Patient.find({
    _id: { $in: inactiveIds },
    tenantIds: tenantId,
    active: { $ne: false },
    $and: [
      { $or: [{ email: { $exists: true, $nin: [null, ''] } }, { phone: { $exists: true, $nin: [null, ''] } }] },
      { $or: [{ reengagementSentAt: { $exists: false } }, { reengagementSentAt: null }, { reengagementSentAt: { $lt: recontactCutoff } }] },
    ],
  })
    .select('_id firstName lastName email phone')
    .limit(BATCH_LIMIT);

  for (const patient of patients) {
    result.processed++;

    const smsMessage =
      `Hi ${patient.firstName}! We miss you at ${clinicName}. It's been a while since your ` +
      `last visit. Book an appointment today to stay on top of your health. We look forward ` +
      `to seeing you!`;

    try {
      if (patient.phone) {
        await sendSMS({ to: patient.phone, message: smsMessage });
      }

      if (patient.email) {
        await sendEmail({
          to: patient.email,
          subject: `We Miss You, ${patient.firstName}! Time for Your Check-Up`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto">
              <h2>We Miss You!</h2>
              <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
              <p>It has been more than ${INACTIVE_MONTHS} months since your last visit with us.
                 Regular check-ups are an important part of staying healthy.</p>
              <p>We'd love to see you again! Please call us or use our online portal to book
                 your next appointment at your convenience.</p>
              <p>Your health is our priority. We look forward to caring for you.</p>
              <p>Warm regards,<br>The ${escapeHtml(clinicName)} Team</p>
            </div>
          `,
        });
      }

      // Patients have no User account, so no in-app notification is created here.
      result.contacted++;
    } catch (err: unknown) {
      result.failed++;
      result.errors.push(`Patient ${patient._id}: ${errorMessage(err)}`);
    }

    await Patient.updateOne({ _id: patient._id }, { $set: { reengagementSentAt: new Date() } }).catch((err) =>
      result.errors.push(`Marker ${patient._id}: ${errorMessage(err)}`)
    );
  }

  return result;
}

/**
 * Find inactive patients and send re-engagement messages.
 * Without a tenantId every active tenant is processed.
 */
export async function processPatientReengagement(
  tenantId?: Types.ObjectId | string
): Promise<PatientReengagementResult> {
  await connectDB();

  const total: PatientReengagementResult = { processed: 0, contacted: 0, skipped: 0, failed: 0, errors: [] };
  try {
    const runs = await forEachTenant(tenantId, processTenant);
    for (const run of runs) {
      if (!run.result) {
        total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
        continue;
      }
      total.processed += run.result.processed;
      total.contacted += run.result.contacted;
      total.skipped += run.result.skipped;
      total.failed += run.result.failed;
      total.errors.push(...run.result.errors);
    }
  } catch (err: unknown) {
    total.errors.push(`Query failed: ${errorMessage(err)}`);
  }
  return total;
}
