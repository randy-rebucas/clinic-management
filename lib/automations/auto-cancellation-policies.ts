// Auto-Cancellation Policies Automation
// Implements progressive actions for chronic no-shows

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById, updatePatient } from '@/lib/data/patient';
import { listUsers } from '@/lib/data/user';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface NoShowRecord {
  patientId: string;
  patient: any;
  noShowCount: number;
  lastNoShowDate: Date;
  currentRestriction?: 'none' | 'deposit_required' | 'walk_in_only' | 'banned';
}

export interface CancellationPolicyResult {
  success: boolean;
  processed: number;
  restrictionsApplied: number;
  notificationsSent: number;
  errors: number;
  records: NoShowRecord[];
}

/**
 * Count no-shows for a patient within a time period
 */
async function countNoShows(
  patientId: string,
  tenantId?: string,
  lookbackDays: number = 365
): Promise<{ count: number; lastNoShowDate?: Date }> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  const noShows = await prisma.appointment.findMany({
    where: {
      patientId,
      status: 'no_show' as any,
      updatedAt: { gte: lookbackDate },
      ...(tenantId ? { tenantId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 10, // Get recent no-shows
  });

  const lastNoShow = noShows.length > 0 ? noShows[0] : null;

  return {
    count: noShows.length,
    lastNoShowDate: lastNoShow ? new Date(lastNoShow.updatedAt) : undefined,
  };
}

/**
 * Determine restriction based on no-show count
 */
function determineRestriction(noShowCount: number): 'none' | 'deposit_required' | 'walk_in_only' | 'banned' {
  if (noShowCount === 0) return 'none';
  if (noShowCount === 1) return 'none'; // First no-show: warning only
  if (noShowCount === 2) return 'deposit_required'; // Second: require deposit
  if (noShowCount === 3) return 'walk_in_only'; // Third: walk-in only
  return 'banned'; // 4+: may need admin approval
}

/**
 * Apply restriction to patient record.
 *
 * The Mongoose model had a free-form `metadata` map; the Postgres Patient
 * schema has no such column, so the restriction + timestamp are persisted
 * into the patient's flattened `segmentFlags`-adjacent notes field instead
 * (`socialHistory.notes`), the closest free-text field the migrated schema
 * exposes, prefixed so it can be round-tripped/parsed if needed.
 */
async function applyPatientRestriction(
  patientId: string,
  restriction: 'none' | 'deposit_required' | 'walk_in_only' | 'banned'
): Promise<{ success: boolean; error?: string }> {
  try {
    const patient = await getPatientById(patientId);
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const existingNotes = (patient as any).socialHistory?.notes || '';
    const strippedNotes = existingNotes.replace(/\[appointmentRestriction:[^\]]*\]/g, '').trim();
    const restrictionTag = `[appointmentRestriction:${restriction}:${new Date().toISOString()}]`;
    const newNotes = `${strippedNotes} ${restrictionTag}`.trim();

    await updatePatient(patientId, {
      socialHistory: { ...(patient as any).socialHistory, notes: newNotes },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error applying patient restriction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send restriction notification to patient
 */
async function sendRestrictionNotification(
  patient: any,
  noShowCount: number,
  restriction: 'none' | 'deposit_required' | 'walk_in_only' | 'banned',
  tenantId?: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    let subject = '';
    let message = '';
    let priority: 'normal' | 'high' | 'urgent' = 'normal';

    if (restriction === 'none' && noShowCount === 1) {
      subject = 'Appointment No-Show Warning';
      message = `You missed your recent appointment. Please call to reschedule if needed. `;
      message += `Repeated no-shows may result in booking restrictions.`;
      priority = 'normal';
    } else if (restriction === 'deposit_required') {
      subject = 'Appointment Booking Restriction';
      message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
      message += `a deposit will be required for future appointments. `;
      message += `Please contact the clinic for more information.`;
      priority = 'high';
    } else if (restriction === 'walk_in_only') {
      subject = 'Appointment Booking Restriction';
      message = `Due to repeated missed appointments (${noShowCount} no-show(s)), `;
      message += `you will need to book as a walk-in patient for future appointments. `;
      message += `Please contact the clinic if you have questions.`;
      priority = 'high';
    } else if (restriction === 'banned') {
      subject = 'Appointment Booking Restriction';
      message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
      message += `future appointments require administrative approval. `;
      message += `Please contact the clinic to discuss booking options.`;
      priority = 'urgent';
    }

    let sent = false;

    // Send SMS if available
    if (patient.contacts?.phone || patient.phone) {
      try {
        let phoneNumber = (patient.contacts?.phone || patient.phone).trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message: `${subject}: ${message}`,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending restriction SMS:', error);
      }
    }

    // Send email if available
    const patientEmail = patient.contacts?.email || patient.email;
    if (patientEmail) {
      try {
        const emailHtml = `
          <h2>${subject}</h2>
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>${message}</p>
          <p><strong>No-Show Count:</strong> ${noShowCount}</p>
          <p><strong>Restriction:</strong> ${restriction.replace(/_/g, ' ').toUpperCase()}</p>
          <p>Please contact the clinic if you have any questions or concerns.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/patients/${patient.id}">View Patient Portal</a></p>
        `;

        const emailResult = await sendEmail({
          to: patientEmail,
          subject,
          html: emailHtml,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending restriction email:', error);
      }
    }

    // Send in-app notification if patient has account
    if (patient.id) {
      try {
        await createNotification({
          userId: patient.id,
          type: 'appointment',
          priority,
          title: subject,
          message,
          relatedEntityType: 'patient',
          relatedEntityId: patient.id,
          actionUrl: `/patients/${patient.id}`,
        });

        sent = true;
      } catch (error) {
        console.error('Error creating restriction notification:', error);
      }
    }

    // Also notify clinic staff for high-level restrictions
    if (restriction === 'walk_in_only' || restriction === 'banned') {
      try {
        const staff = await listUsers({
          ...(tenantId ? { tenantId } : {}),
          role: { name: { in: ['admin', 'receptionist'] } },
        } as any);

        for (const staffMember of staff) {
          await createNotification({
            userId: staffMember.id,
            type: 'appointment',
            priority: 'high',
            title: `Patient Appointment Restriction Applied`,
            message: `${patient.firstName} ${patient.lastName} (${noShowCount} no-shows) - ${restriction.replace(/_/g, ' ').toUpperCase()}`,
            relatedEntityType: 'patient',
            relatedEntityId: patient.id,
            actionUrl: `/patients/${patient.id}`,
          }).catch(console.error);
        }
      } catch (error) {
        console.error('Error notifying clinic staff:', error);
      }
    }

    return { sent };
  } catch (error: any) {
    console.error('Error sending restriction notification:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Process patients and apply cancellation policies
 * This should be called by a cron job
 */
export async function processAutoCancellationPolicies(
  tenantId?: string
): Promise<CancellationPolicyResult> {
  try {
    const tId = tenantId ? String(tenantId) : undefined;

    return await run(tId, async () => {
      const settings = await getSettings(tId);
      const autoCancellationPolicies = (settings.automationSettings as any)?.autoCancellationPolicies !== false;

      if (!autoCancellationPolicies) {
        return {
          success: true,
          processed: 0,
          restrictionsApplied: 0,
          notificationsSent: 0,
          errors: 0,
          records: [],
        };
      }

      // Find all patients with no-show appointments in the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const noShowAppointments = await prisma.appointment.findMany({
        where: {
          status: 'no_show' as any,
          updatedAt: { gte: oneYearAgo },
          ...(tId ? { tenantId: tId } : {}),
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });

      const records: NoShowRecord[] = [];
      let restrictionsApplied = 0;
      let notificationsSent = 0;
      let errors = 0;

      // Process each patient
      for (const { patientId } of noShowAppointments) {
        if (!patientId) continue;

        const noShowInfo = await countNoShows(patientId, tId);

        if (noShowInfo.count === 0) continue;

        const patient = await getPatientById(patientId);
        if (!patient) continue;

        const currentRestrictionMatch = ((patient as any).socialHistory?.notes || '').match(
          /\[appointmentRestriction:([^:]+):/
        );
        const currentRestriction = currentRestrictionMatch?.[1] || 'none';
        const restriction = determineRestriction(noShowInfo.count);

        // Only apply if restriction has changed or needs update
        if (restriction !== 'none' && restriction !== currentRestriction) {
          const applyResult = await applyPatientRestriction(patientId, restriction);

          if (applyResult.success) {
            restrictionsApplied++;
          } else {
            errors++;
          }
        }

        // Send notification if restriction is new or count changed
        if (restriction !== currentRestriction || noShowInfo.count > 0) {
          const notificationResult = await sendRestrictionNotification(
            patient,
            noShowInfo.count,
            restriction,
            tId
          );

          if (notificationResult.sent) {
            notificationsSent++;
          }
        }

        records.push({
          patientId,
          patient,
          noShowCount: noShowInfo.count,
          lastNoShowDate: noShowInfo.lastNoShowDate || new Date(),
          currentRestriction: restriction,
        });
      }

      return {
        success: true,
        processed: noShowAppointments.length,
        restrictionsApplied,
        notificationsSent,
        errors,
        records,
      };
    });
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
