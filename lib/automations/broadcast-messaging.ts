// Broadcast Messaging Automation
// Sends messages to patient groups

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

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
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
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
    await connectDB();

    const settings = await getSettings();
    const autoBroadcastMessaging = (settings.automationSettings as any)?.autoBroadcastMessaging !== false;

    if (!autoBroadcastMessaging) {
      return { success: true, sent: 0, failed: 0, errors: [] };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : undefined;

    // Build patient query based on target group
    const query: any = {
      active: { $ne: false },
    };

    if (tenantId) {
      query.tenantId = tenantId;
    }

    const targetGroup = options.targetGroup || { type: 'all' };

    // Apply filters based on target group
    if (targetGroup.type === 'ageRange') {
      if (targetGroup.minAge || targetGroup.maxAge) {
        const now = new Date();
        if (targetGroup.maxAge) {
          const minDate = new Date(now.getFullYear() - targetGroup.maxAge - 1, now.getMonth(), now.getDate());
          query.dateOfBirth = { ...query.dateOfBirth, $gte: minDate };
        }
        if (targetGroup.minAge) {
          const maxDate = new Date(now.getFullYear() - targetGroup.minAge, now.getMonth(), now.getDate());
          query.dateOfBirth = { ...query.dateOfBirth, $lte: maxDate };
        }
      }
    } else if (targetGroup.type === 'condition') {
      if (targetGroup.condition) {
        query['medicalHistory.conditions'] = { $in: [new RegExp(targetGroup.condition, 'i')] };
      }
    } else if (targetGroup.type === 'lastVisit') {
      if (targetGroup.daysSinceLastVisit) {
        const cutoffDate = new Date(Date.now() - targetGroup.daysSinceLastVisit * 24 * 60 * 60 * 1000);
        // This would require joining with Visit model - simplified for now
      }
    } else if (targetGroup.type === 'custom') {
      if (targetGroup.patientIds && targetGroup.patientIds.length > 0) {
        query._id = { $in: targetGroup.patientIds.map(id => new Types.ObjectId(id)) };
      }
    }

    const patients = await Patient.find(query);

    let sent = 0;
    let failed = 0;
    const errors: Array<{ patientId: string; error: string }> = [];

    const clinicName = settings.clinicName || 'Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

    for (const patient of patients) {
      try {
        // Send SMS if enabled and phone available
        if (options.sendSMS !== false && patient.phone) {
          try {
            let phoneNumber = patient.phone.trim();
            if (!phoneNumber.startsWith('+')) {
              phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
            }

            await sendSMS({
              to: phoneNumber,
              message: options.message,
            });
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient._id.toString(), error: `SMS: ${error.message}` });
            failed++;
          }
        }

        // Send email if enabled and email available
        if (options.sendEmail !== false && patient.email) {
          try {
            const emailContent = generateBroadcastEmail(options.message, options.subject, settings, baseUrl);
            await sendEmail({
              to: patient.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient._id.toString(), error: `Email: ${error.message}` });
            failed++;
          }
        }

        // Send in-app notification
        if (options.sendNotification !== false && patient._id) {
          try {
            await createNotification({
              userId: patient._id,
              tenantId,
              type: 'broadcast',
              priority: 'normal',
              title: options.subject || 'Clinic Announcement',
              message: options.message,
              actionUrl: baseUrl,
            });
            sent++;
          } catch (error: any) {
            errors.push({ patientId: patient._id.toString(), error: `Notification: ${error.message}` });
            failed++;
          }
        }
      } catch (error: any) {
        errors.push({ patientId: patient._id.toString(), error: error.message });
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

