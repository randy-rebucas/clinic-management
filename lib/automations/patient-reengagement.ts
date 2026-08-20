// Patient Re-engagement Automation
// Identifies inactive patients (no visit in X months) and sends a friendly
// re-engagement message encouraging them to book an appointment.

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listPatientsByIdsForAutomation } from '@/lib/data/patient';
import { distinctPatientIdsWithVisitSince, distinctPatientIdsWithAnyVisit } from '@/lib/data/visit';
import { distinctPatientIdsWithAppointmentSince } from '@/lib/data/appointment';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
export async function processPatientReengagement(tenantId?: string): Promise<PatientReengagementResult> {
  const resolvedTenantId = tenantId ?? null;

  const result: PatientReengagementResult = {
    processed: 0,
    contacted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - INACTIVE_MONTHS);

  try {
    // Step 1: get IDs of patients with a recent visit or appointment
    const [recentVisitPatientIds, recentApptPatientIds] = await run(resolvedTenantId, () =>
      Promise.all([
        distinctPatientIdsWithVisitSince(cutoffDate),
        distinctPatientIdsWithAppointmentSince(cutoffDate, ['completed', 'confirmed']),
      ])
    );

    const recentIds = new Set([...recentVisitPatientIds, ...recentApptPatientIds]);

    // Step 2: get patients who HAVE had a visit (not brand new) but NOT recently
    const pastVisitPatientIds = await run(resolvedTenantId, () => distinctPatientIdsWithAnyVisit());

    const inactiveIds = pastVisitPatientIds.filter((id) => !recentIds.has(id)).slice(0, BATCH_LIMIT);

    if (inactiveIds.length === 0) return result;

    const patients = await run(resolvedTenantId, () => listPatientsByIdsForAutomation(inactiveIds));
    const contactable = patients.filter((p) => p.email || p.phone || p.contactsEmail || p.contactsPhone).slice(0, BATCH_LIMIT);

    for (const patient of contactable) {
      result.processed++;

      const patientName = `${patient.firstName} ${patient.lastName}`;

      const smsMessage =
        `Hi ${patient.firstName}! We miss you at the clinic. It's been a while since your ` +
        `last visit. Book an appointment today to stay on top of your health. We look forward ` +
        `to seeing you!`;

      try {
        // SMS
        const phone = patient.phone || patient.contactsPhone;
        if (phone) {
          let phoneStr = String(phone).trim();
          if (!phoneStr.startsWith('+')) phoneStr = `+63${phoneStr.replace(/\D/g, '').slice(-10)}`;
          await sendSMS({ to: phoneStr, message: smsMessage });
        }

        // Email
        const email = patient.email || patient.contactsEmail;
        if (email) {
          await sendEmail({
            to: email,
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

        // In-app notification: skipped — Notification.userId is a hard FK to
        // User and patients have no linked User account.

        result.contacted++;
      } catch (err: unknown) {
        result.failed++;
        result.errors.push(`Patient ${patient.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`Query failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
