// Lab Result Notification Automation
// Automatically notifies patients and doctors when lab results are available

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getLabResultById, updateLabResult } from '@/lib/data/lab-result';
import { getSettings } from '@/lib/settings';
import { createNotification, createLabResultNotification } from '@/lib/notifications';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

export interface LabNotificationOptions {
  labResultId: any;
  tenantId?: any;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send notification for lab result
 */
export async function sendLabResultNotification(options: LabNotificationOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    return await run(options.tenantId, async () => {
      const settings = await getSettings();
      const autoLabNotifications = (settings.automationSettings as any)?.autoLabNotifications !== false;

      if (!autoLabNotifications) {
        return { success: true, sent: false };
      }

      const labResult = await getLabResultById(String(options.labResultId));

      if (!labResult) {
        return { success: false, sent: false, error: 'Lab result not found' };
      }

      // Check if lab result is completed
      if ((labResult as any).status !== 'completed' && (labResult as any).status !== 'reviewed') {
        return { success: false, sent: false, error: 'Lab result is not completed' };
      }

      // Check if already notified
      if ((labResult as any).notificationSent) {
        return { success: true, sent: false };
      }

      const patient = (labResult as any).patient;
      if (!patient) {
        return { success: false, sent: false, error: 'Patient not found' };
      }

      const tenantId = options.tenantId ? String(options.tenantId) : (labResult as any).tenantId;

      let sent = false;

      // Send SMS if enabled and phone available
      if (options.sendSMS !== false && patient.phone) {
        try {
          const message = `Your lab results for ${(labResult as any).request.testType} are now available. Request Code: ${(labResult as any).requestCode || 'N/A'}. Please contact the clinic to view your results.`;

          let phoneNumber = patient.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const smsResult = await sendSMS({
            to: phoneNumber,
            message,
          });

          if (smsResult.success) {
            sent = true;
          }
        } catch (error) {
          console.error('Error sending lab result SMS:', error);
        }
      }

      // Send email if enabled and email available
      if (options.sendEmail !== false && patient.email) {
        try {
          const emailContent = generateLabResultEmail(labResult);
          const emailResult = await sendEmail({
            to: patient.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });

          if (emailResult.success) {
            sent = true;
          }
        } catch (error) {
          console.error('Error sending lab result email:', error);
        }
      }

      // Send in-app notification to patient
      if (options.sendNotification !== false && patient.id) {
        try {
          await createLabResultNotification(patient.id, labResult);
          sent = true;
        } catch (error) {
          console.error('Error creating lab result notification:', error);
        }
      }

      // Notify ordering doctor if different from current user
      const orderedBy = (labResult as any).orderedBy;
      if (orderedBy && orderedBy.id && options.sendNotification !== false) {
        try {
          await createNotification({
            userId: orderedBy.id,
            tenantId,
            type: 'lab_result',
            priority: 'normal',
            title: 'Lab Results Available',
            message: `Lab results for ${(labResult as any).request.testType} are now available for review.`,
            relatedEntity: {
              type: 'lab_result',
              id: (labResult as any).id,
            },
            actionUrl: `/lab-results/${(labResult as any).id}`,
          });
        } catch (error) {
          console.error('Error notifying doctor:', error);
        }
      }

      // Update notification status
      if (sent) {
        await updateLabResult((labResult as any).id, {
          notificationSent: true,
          notificationSentAt: new Date(),
          notificationMethod: (options.sendSMS && options.sendEmail) ? 'both' :
                              (options.sendEmail ? 'email' : 'sms'),
        } as any);
      }

      return { success: true, sent };
    });
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send lab result notification'
    };
  }
}

/**
 * Check for abnormal/critical lab values and send urgent alerts
 */
export async function checkAbnormalLabValues(labResultId: any, tenantId?: any): Promise<{
  hasAbnormal: boolean;
  critical: boolean;
  alertsSent: boolean;
}> {
  try {
    return await run(tenantId, async () => {
      const labResult = await getLabResultById(String(labResultId));

      if (!labResult || !(labResult as any).abnormalFlags) {
        return { hasAbnormal: false, critical: false, alertsSent: false };
      }

      const abnormalFlags = (labResult as any).abnormalFlags as any;
      const hasAbnormal = Object.keys(abnormalFlags).length > 0;
      const critical = Object.values(abnormalFlags).some((flag: any) =>
        flag === 'high' || flag === 'low'
      );

      if (hasAbnormal && critical) {
        // Send urgent notification to doctor
        const orderedBy = (labResult as any).orderedBy;
        if (orderedBy && orderedBy.id) {
          try {
            await createNotification({
              userId: orderedBy.id,
              tenantId: (labResult as any).tenantId,
              type: 'lab_result',
              priority: 'urgent',
              title: 'URGENT: Abnormal Lab Results',
              message: `Lab results for ${(labResult as any).request.testType} show abnormal/critical values. Immediate review required.`,
              relatedEntity: {
                type: 'lab_result',
                id: (labResult as any).id,
              },
              actionUrl: `/lab-results/${(labResult as any).id}`,
            });
            return { hasAbnormal: true, critical: true, alertsSent: true };
          } catch (error) {
            console.error('Error sending urgent lab alert:', error);
          }
        }
      }

      return { hasAbnormal, critical, alertsSent: false };
    });
  } catch (error: any) {
    console.error('Error checking abnormal lab values:', error);
    return { hasAbnormal: false, critical: false, alertsSent: false };
  }
}
