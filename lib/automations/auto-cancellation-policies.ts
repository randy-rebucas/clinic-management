// Auto-Cancellation Policies Automation
// Implements progressive actions for chronic no-shows

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantStaff,
  safeNotify,
  delivered,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

type Restriction = 'none' | 'deposit_required' | 'walk_in_only' | 'banned';

export interface NoShowRecord {
  patientId: Types.ObjectId;
  patient: any;
  noShowCount: number;
  lastNoShowDate: Date;
  currentRestriction?: Restriction;
}

export interface CancellationPolicyResult {
  success: boolean;
  processed: number;
  restrictionsApplied: number;
  notificationsSent: number;
  errors: number;
  records: NoShowRecord[];
}

const LOOKBACK_DAYS = 365;
const NOTIFY_WINDOW_DAYS = 14;

/**
 * Determine restriction based on no-show count
 */
function determineRestriction(noShowCount: number): Restriction {
  if (noShowCount <= 1) return 'none'; // First no-show: warning only
  if (noShowCount === 2) return 'deposit_required';
  if (noShowCount === 3) return 'walk_in_only';
  return 'banned'; // 4+: may need admin approval
}

/**
 * Send restriction notification to patient (and staff for severe restrictions)
 */
async function sendRestrictionNotification(
  patient: any,
  noShowCount: number,
  restriction: Restriction,
  tenantId: Types.ObjectId,
  clinicName: string
): Promise<{ sent: boolean; error?: string }> {
  let subject = '';
  let message = '';

  if (restriction === 'none') {
    subject = 'Appointment No-Show Warning';
    message = `You missed your recent appointment. Please call to reschedule if needed. `;
    message += `Repeated no-shows may result in booking restrictions.`;
  } else if (restriction === 'deposit_required') {
    subject = 'Appointment Booking Restriction';
    message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
    message += `a deposit will be required for future appointments. `;
    message += `Please contact the clinic for more information.`;
  } else if (restriction === 'walk_in_only') {
    subject = 'Appointment Booking Restriction';
    message = `Due to repeated missed appointments (${noShowCount} no-show(s)), `;
    message += `you will need to book as a walk-in patient for future appointments. `;
    message += `Please contact the clinic if you have questions.`;
  } else {
    subject = 'Appointment Booking Restriction';
    message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
    message += `future appointments require administrative approval. `;
    message += `Please contact the clinic to discuss booking options.`;
  }

  let sent = false;

  if (patient.phone) {
    try {
      const smsResult = await sendSMS({ to: patient.phone, message: `${clinicName}: ${subject}: ${message}` });
      if (delivered(smsResult)) sent = true;
    } catch (error) {
      console.error('Error sending restriction SMS:', error);
    }
  }

  if (patient.email) {
    try {
      const emailHtml = `
        <h2>${escapeHtml(subject)}</h2>
        <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
        <p>${escapeHtml(message)}</p>
        <p><strong>No-Show Count:</strong> ${noShowCount}</p>
        ${restriction !== 'none' ? `<p><strong>Restriction:</strong> ${restriction.replace(/_/g, ' ').toUpperCase()}</p>` : ''}
        <p>Please contact ${escapeHtml(clinicName)} if you have any questions or concerns.</p>
      `;
      const emailResult = await sendEmail({ to: patient.email, subject, html: emailHtml });
      if (delivered(emailResult)) sent = true;
    } catch (error) {
      console.error('Error sending restriction email:', error);
    }
  }

  if (restriction === 'walk_in_only' || restriction === 'banned') {
    try {
      const staff = await getTenantStaff(tenantId, ['admin', 'receptionist']);
      for (const staffMember of staff) {
        await safeNotify({
          userId: staffMember._id,
          tenantId,
          type: 'appointment',
          priority: 'high',
          title: 'Patient Appointment Restriction Applied',
          message: `${patient.firstName} ${patient.lastName} (${noShowCount} no-shows) - ${restriction.replace(/_/g, ' ').toUpperCase()}`,
          relatedEntity: { type: 'patient', id: patient._id },
          actionUrl: `/patients/${patient._id}`,
        });
      }
    } catch (error) {
      console.error('Error notifying clinic staff:', error);
    }
  }

  return { sent };
}

async function processTenant(tenant: AutomationTenant): Promise<CancellationPolicyResult> {
  const result: CancellationPolicyResult = {
    success: true,
    processed: 0,
    restrictionsApplied: 0,
    notificationsSent: 0,
    errors: 0,
    records: [],
  };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoCancellationPolicies')) return result;
  const clinicName = settings.clinicName || tenant.name || 'The Clinic';

  const lookback = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const counts = await Appointment.aggregate([
    { $match: { tenantId: tenant.tenantObjectId, status: 'no-show', updatedAt: { $gte: lookback } } },
    { $group: { _id: '$patient', count: { $sum: 1 }, last: { $max: '$updatedAt' } } },
    { $limit: BATCH_LIMIT },
  ]);

  for (const row of counts) {
    if (!row._id) continue;
    result.processed++;
    try {
      const patient = await Patient.findOne({ _id: row._id, tenantIds: tenant.tenantObjectId })
        .select('firstName lastName email phone appointmentRestriction noShowNotifiedCount');
      if (!patient) continue;

      const noShowCount: number = row.count;
      const currentRestriction: Restriction = (patient as any).appointmentRestriction || 'none';
      const restriction = determineRestriction(noShowCount);
      const notifiedCount: number = (patient as any).noShowNotifiedCount || 0;

      const update: Record<string, unknown> = {};
      if (restriction !== currentRestriction) {
        update.appointmentRestriction = restriction;
        update.restrictionAppliedAt = new Date();
        if (restriction !== 'none') result.restrictionsApplied++;
      }

      // Only tell the patient about no-shows they haven't been told about yet.
      const recent = row.last && new Date(row.last).getTime() >= Date.now() - NOTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (noShowCount > notifiedCount && !recent) {
        // Stale no-shows (e.g. before this marker existed): record without messaging.
        update.noShowNotifiedCount = noShowCount;
      } else if (noShowCount > notifiedCount) {
        const notification = await sendRestrictionNotification(
          patient,
          noShowCount,
          restriction,
          tenant.tenantObjectId,
          clinicName
        );
        if (notification.sent) result.notificationsSent++;
        update.noShowNotifiedCount = noShowCount;
      } else if (noShowCount < notifiedCount) {
        // Older no-shows aged out of the lookback window.
        update.noShowNotifiedCount = noShowCount;
      }

      if (Object.keys(update).length) {
        await Patient.updateOne({ _id: patient._id }, { $set: update });
      }

      result.records.push({
        patientId: patient._id as Types.ObjectId,
        patient: { _id: patient._id, firstName: patient.firstName, lastName: patient.lastName },
        noShowCount,
        lastNoShowDate: row.last || new Date(),
        currentRestriction: restriction,
      });
    } catch (error) {
      result.errors++;
      console.error('[auto-cancellation] patient failed:', errorMessage(error));
    }
  }

  return result;
}

/**
 * Process patients and apply cancellation policies.
 * Without a tenantId every active tenant is processed.
 */
export async function processAutoCancellationPolicies(
  tenantId?: string | Types.ObjectId
): Promise<CancellationPolicyResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoCancellationPolicies' });

    const total: CancellationPolicyResult = {
      success: runs.every((r) => r.success),
      processed: 0,
      restrictionsApplied: 0,
      notificationsSent: 0,
      errors: 0,
      records: [],
    };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.restrictionsApplied += run.result.restrictionsApplied;
      total.notificationsSent += run.result.notificationsSent;
      total.errors += run.result.errors;
      total.records.push(...run.result.records);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing auto-cancellation policies:', error);
    return {
      success: false,
      processed: 0,
      restrictionsApplied: 0,
      notificationsSent: 0,
      errors: 1,
      records: [],
    };
  }
}
