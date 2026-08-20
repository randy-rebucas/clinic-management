// Broadcast Messaging Automation
// Sends messages to patient groups

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import {
  listActivePatientsForAutomation,
  listPatientsByIdsForAutomation,
  type PatientAutomationRow,
} from '@/lib/data/patient';
import { getAutomationSettings, getOrCreateSettings } from '@/lib/data/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface BroadcastMessageOptions {
  message: string;
  subject?: string;
  targetGroup?: {
    type: 'all' | 'ageRange' | 'condition' | 'lastVisit' | 'custom';
    minAge?: number;
    maxAge?: number;
    condition?: string;
    daysSinceLastVisit?: number;
    patientIds?: string[];
  };
  tenantId?: string;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

function ageFromDob(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * Send broadcast message to patient group
 */
export async function sendBroadcastMessage(options: BroadcastMessageOptions): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{ patientId: string; error: string }>;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoBroadcastMessaging) {
      return { success: true, sent: 0, failed: 0, errors: [] };
    }

    const targetGroup = options.targetGroup || { type: 'all' as const };

    let patients: PatientAutomationRow[];
    if (targetGroup.type === 'custom' && targetGroup.patientIds?.length) {
      patients = await run(tenantId, () => listPatientsByIdsForAutomation(targetGroup.patientIds!));
    } else {
      patients = await run(tenantId, () => listActivePatientsForAutomation());

      if (targetGroup.type === 'ageRange' && (targetGroup.minAge || targetGroup.maxAge)) {
        patients = patients.filter((p) => {
          if (!p.dateOfBirth) return false;
          const age = ageFromDob(p.dateOfBirth);
          if (targetGroup.minAge !== undefined && age < targetGroup.minAge) return false;
          if (targetGroup.maxAge !== undefined && age > targetGroup.maxAge) return false;
          return true;
        });
      } else if (targetGroup.type === 'condition') {
        // Pre-existing conditions live on a separate child table not included
        // in the lightweight automation projection; condition-based targeting
        // is not implemented (matches the original Mongoose module, which
        // also left this branch as a no-op filter).
      } else if (targetGroup.type === 'lastVisit') {
        // Would require joining with Visit — simplified for now, same as the
        // original Mongoose implementation.
      }
    }

    let sent = 0;
    let failed = 0;
    const errors: Array<{ patientId: string; error: string }> = [];

    const settings = await run(tenantId, () => getOrCreateSettings(tenantId));
    const clinicName = settings.clinicName || 'Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

    for (const patient of patients) {
      try {
        // Send SMS if enabled and phone available
        const phone = patient.phone || patient.contactsPhone;
        if (options.sendSMS !== false && phone) {
          try {
            let phoneNumber = String(phone).trim();
            if (!phoneNumber.startsWith('+')) {
              phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
            }

            await sendSMS({
              to: phoneNumber,
              message: options.message,
            });
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient.id, error: `SMS: ${error.message}` });
            failed++;
          }
        }

        // Send email if enabled and email available
        const email = patient.email || patient.contactsEmail;
        if (options.sendEmail !== false && email) {
          try {
            const emailContent = generateBroadcastEmail(options.message, options.subject, settings, baseUrl);
            await sendEmail({
              to: email,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient.id, error: `Email: ${error.message}` });
            failed++;
          }
        }

        // Send in-app notification: skipped for patients — Notification.userId
        // is a hard FK to User and patients have no linked User account. Kept
        // as a guarded no-op (matches the original module's intent) rather
        // than throwing, since options.sendNotification is still honored by
        // callers expecting a `sent` increment for staff-facing broadcasts.
        if (options.sendNotification !== false && (patient as any).userId) {
          try {
            await run(tenantId, () =>
              createNotification({
                userId: (patient as any).userId,
                type: 'system',
                priority: 'normal',
                title: options.subject || 'Clinic Announcement',
                message: options.message,
                actionUrl: baseUrl,
              })
            );
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient.id, error: `Notification: ${error.message}` });
            failed++;
          }
        }
      } catch (error: any) {
        errors.push({ patientId: patient.id, error: error.message });
        failed++;
      }
    }

    return { success: true, sent, failed, errors };
  } catch (error: any) {
    console.error('Error sending broadcast message:', error);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [{ patientId: 'unknown', error: error.message }],
    };
  }
}

/**
 * Generate broadcast email
 */
function generateBroadcastEmail(
  message: string,
  subject?: string,
  settings?: any,
  baseUrl?: string
): { subject: string; html: string } {
  const clinicName = settings?.clinicName || 'Clinic';
  const emailSubject = subject || `Announcement from ${clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .message-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${clinicName}</h1>
        </div>
        <div class="content">
          <div class="message-box">
            ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
          </div>
          ${baseUrl ? `<p><a href="${baseUrl}">Visit our website</a></p>` : ''}
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject: emailSubject, html };
}
