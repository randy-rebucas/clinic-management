// Broadcast Messaging Automation
// Sends messages to patient groups

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import { automationEnabled, errorMessage } from './shared';

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

const MAX_RECIPIENTS = 5000;

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

    if (!options.tenantId) {
      return { success: false, sent: 0, failed: 0, errors: [{ patientId: 'unknown', error: 'Tenant is required' }] };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoBroadcastMessaging')) {
      return { success: true, sent: 0, failed: 0, errors: [] };
    }

    const query: any = {
      tenantIds: tenantId,
      active: { $ne: false },
    };

    const targetGroup = options.targetGroup || { type: 'all' };

    if (targetGroup.type === 'ageRange') {
      const now = new Date();
      if (targetGroup.maxAge) {
        const minDate = new Date(now.getFullYear() - targetGroup.maxAge - 1, now.getMonth(), now.getDate());
        query.dateOfBirth = { ...query.dateOfBirth, $gte: minDate };
      }
      if (targetGroup.minAge) {
        const maxDate = new Date(now.getFullYear() - targetGroup.minAge, now.getMonth(), now.getDate());
        query.dateOfBirth = { ...query.dateOfBirth, $lte: maxDate };
      }
    } else if (targetGroup.type === 'condition') {
      if (!targetGroup.condition) {
        return { success: false, sent: 0, failed: 0, errors: [{ patientId: 'unknown', error: 'condition is required' }] };
      }
      // The caller (app/api/broadcast) validates and regex-escapes `condition`; escaping again would break matches.
      const re = new RegExp(String(targetGroup.condition).slice(0, 200), 'i');
      query.$or = [{ 'preExistingConditions.condition': re }, { medicalHistory: re }];
    } else if (targetGroup.type === 'lastVisit') {
      if (!targetGroup.daysSinceLastVisit) {
        return { success: false, sent: 0, failed: 0, errors: [{ patientId: 'unknown', error: 'daysSinceLastVisit is required' }] };
      }
      const cutoffDate = new Date(Date.now() - targetGroup.daysSinceLastVisit * 24 * 60 * 60 * 1000);
      const [visitedBefore, recentlyVisited] = await Promise.all([
        Visit.distinct('patient', { tenantId, date: { $lt: cutoffDate } }),
        Visit.distinct('patient', { tenantId, date: { $gte: cutoffDate } }),
      ]);
      const recent = new Set(recentlyVisited.map(String));
      query._id = { $in: visitedBefore.filter((id: unknown) => !recent.has(String(id))) };
    } else if (targetGroup.type === 'custom') {
      const ids = (targetGroup.patientIds || []).filter((id) => Types.ObjectId.isValid(id));
      if (ids.length === 0) {
        return { success: false, sent: 0, failed: 0, errors: [{ patientId: 'unknown', error: 'patientIds required' }] };
      }
      query._id = { $in: ids.map((id) => new Types.ObjectId(id)) };
    }

    const patients = await Patient.find(query)
      .select('_id firstName lastName phone email')
      .limit(MAX_RECIPIENTS)
      .lean();

    let sent = 0;
    let failed = 0;
    const errors: Array<{ patientId: string; error: string }> = [];

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const emailContent = generateBroadcastEmail(options.message, options.subject, settings, baseUrl);

    // Patients have no User account, so in-app notifications (sendNotification) don't apply here.
    for (const patient of patients as any[]) {
      let delivered = false;
      let patientFailed = false;

      if (options.sendSMS !== false && patient.phone) {
        try {
          const r = await sendSMS({ to: patient.phone, message: options.message });
          if (r.success) delivered = true;
          else {
            patientFailed = true;
            errors.push({ patientId: String(patient._id), error: `SMS: ${r.error || 'failed'}` });
          }
        } catch (error) {
          patientFailed = true;
          errors.push({ patientId: String(patient._id), error: `SMS: ${errorMessage(error)}` });
        }
      }

      if (options.sendEmail !== false && patient.email) {
        try {
          const r = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
          if (r.success) delivered = true;
          else {
            patientFailed = true;
            errors.push({ patientId: String(patient._id), error: `Email: ${r.error || 'failed'}` });
          }
        } catch (error) {
          patientFailed = true;
          errors.push({ patientId: String(patient._id), error: `Email: ${errorMessage(error)}` });
        }
      }

      if (delivered) sent++;
      else if (patientFailed) failed++;
    }

    return { success: true, sent, failed, errors };
  } catch (error: any) {
    console.error('Error sending broadcast message:', error);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [{ patientId: 'unknown', error: 'Broadcast failed' }],
    };
  }
}

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
          <h1>${escapeHtml(clinicName)}</h1>
        </div>
        <div class="content">
          <div class="message-box">
            ${message.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          </div>
          ${baseUrl ? `<p><a href="${escapeHtml(baseUrl)}">Visit our website</a></p>` : ''}
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
