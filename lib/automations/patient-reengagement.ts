// Patient Re-engagement Automation
// Identifies inactive patients (no visit in X months) and sends a friendly
// re-engagement message encouraging them to book an appointment.

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { Types } from 'mongoose';

/** Patients with no visit for this many months are considered inactive */
const INACTIVE_MONTHS = 6;

/** Limit per run to avoid spamming and stay within rate limits */
const BATCH_LIMIT = 100;

export interface PatientReengagementResult {
  processed: number;
  contacted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Find inactive patients and send re-engagement messages.
 */
export async function processPatientReengagement(
  tenantId?: Types.ObjectId | string
): Promise<PatientReengagementResult> {
  await connectDB();

  const result: PatientReengagementResult = {
    processed: 0,
    contacted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const tenantFilter = tenantId
    ? { tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId }
    : {};

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVE_MONTHS);

  try {
    // Find patients who have had at least one visit but none after the cutoff
    // Step 1: get IDs of patients with a recent visit or appointment
    const recentVisitPatientIds = await Visit.distinct('patient', {
      ...tenantFilter,
      date: { $gte: cutoffDate },
    });

    const recentApptPatientIds = await Appointment.distinct('patient', {
      ...tenantFilter,
      $or: [
        { appointmentDate: { $gte: cutoffDate } },
        { scheduledAt: { $gte: cutoffDate } },
      ],
      status: { $in: ['completed', 'confirmed'] },
    });

    const recentIds = new Set([
      ...recentVisitPatientIds.map(String),
      ...recentApptPatientIds.map(String),
    ]);

    // Step 2: get patients who HAVE had a visit (not brand new) but NOT recently
    const pastVisitPatientIds = await Visit.distinct('patient', tenantFilter);
    
    const inactiveIds = pastVisitPatientIds
      .filter(id => !recentIds.has(String(id)))
      .slice(0, BATCH_LIMIT);

    if (inactiveIds.length === 0) return result;

    const patients = await Patient.find({
      _id: { $in: inactiveIds },
      $or: [{ email: { $exists: true, $ne: '' } }, { phone: { $exists: true, $ne: '' } }],
    }).limit(BATCH_LIMIT);

    for (const patient of patients) {
      result.processed++;

      const patientName = `${patient.firstName} ${patient.lastName}`;

      const smsMessage =
        `Hi ${patient.firstName}! We miss you at the clinic. It's been a while since your ` +
        `last visit. Book an appointment today to stay on top of your health. We look forward ` +
        `to seeing you!`;

      try {
        // SMS
        if (patient.phone) {
          let phone = (patient.phone as string).trim();
          if (!phone.startsWith('+')) phone = `+63${phone.replace(/\D/g, '').slice(-10)}`;
          await sendSMS({ to: phone, message: smsMessage });
        }

        // Email
        const patientEmail = (patient.email as string | undefined);
        if (patientEmail) {
          await sendEmail({
            to: patientEmail,
            subject: `We Miss You, ${patient.firstName}! Time for Your Check-Up`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto">
                <h2>We Miss You!</h2>
                <p>Dear ${patientName},</p>
                <p>It has been more than ${INACTIVE_MONTHS} months since your last visit with us.
                   Regular check-ups are an important part of staying healthy.</p>
                <p>We'd love to see you again! Please call us or use our online portal to book
                   your next appointment at your convenience.</p>
                <p>Your health is our priority. We look forward to caring for you.</p>
                <p>Warm regards,<br>The Clinic Team</p>
              </div>
            `,
          });
        }

        // In-app notification
        await createNotification({
          type: 'patient_reengagement',
          title: 'We Miss You!',
          message: smsMessage,
          patientId: patient._id,
          metadata: { inactiveMonths: INACTIVE_MONTHS },
        } as any);

        result.contacted++;
      } catch (err: unknown) {
        result.failed++;
        result.errors.push(
          `Patient ${patient._id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err: unknown) {
    result.errors.push(
      `Query failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}
