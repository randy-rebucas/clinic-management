// Appointment Feedback Collection Automation
// Automatically collects patient feedback after visits

import { randomBytes } from 'crypto';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getVisitById, findVisitsNeedingFeedbackRequest, setVisitFeedbackToken } from '@/lib/data/visit';
import { getAutomationSettings, getOrCreateSettings } from '@/lib/data/settings';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface FeedbackCollectionOptions {
  visitId: string;
  tenantId?: string;
  sendSMS?: boolean;
  sendEmail?: boolean;
}

/**
 * Send feedback request to patient
 */
export async function sendFeedbackRequest(options: FeedbackCollectionOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoFeedbackCollection) {
      return { success: true, sent: false };
    }

    let visit = await run(tenantId, () => getVisitById(options.visitId));

    if (!visit) {
      return { success: false, sent: false, error: 'Visit not found' };
    }

    // Only send feedback request for closed visits
    if (visit.status !== 'closed') {
      return { success: true, sent: false };
    }

    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const settings = await run(tenantId, () => getOrCreateSettings(tenantId));
    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

    // Generate a secure token if not already set
    if (!visit.feedbackToken) {
      const token = randomBytes(24).toString('hex');
      await run(tenantId, () => setVisitFeedbackToken(options.visitId, token));
      visit = { ...visit, feedbackToken: token, feedbackRequested: true };
    }

    const token = visit.feedbackToken as string;
    const feedbackUrl = `${baseUrl}/feedback/${token}`;

    const feedbackMessage = generateFeedbackSMS(visit, clinicName, feedbackUrl);
    const emailContent = generateFeedbackEmail(visit, settings, feedbackUrl);

    let sent = false;

    // Send SMS if enabled and phone available
    if (options.sendSMS !== false && patient.phone) {
      try {
        let phoneNumber = String(patient.phone).trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message: feedbackMessage,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending feedback SMS:', error);
      }
    }

    // Send email if enabled and email available
    if (options.sendEmail !== false && patient.email) {
      try {
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending feedback email:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending feedback request:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send feedback request',
    };
  }
}

/**
 * Process all completed visits and send feedback requests
 * This should be called by a cron job
 */
export async function processFeedbackCollection(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  requestsSent: number;
  errors: number;
  results: Array<{ visitId: string; success: boolean; error?: string }>;
}> {
  try {
    const resolvedTenantId = tenantId ?? null;

    const automationSettings = await run(resolvedTenantId, () => getAutomationSettings(resolvedTenantId));
    if (!automationSettings.autoFeedbackCollection) {
      return { success: true, processed: 0, requestsSent: 0, errors: 0, results: [] };
    }

    // Find visits closed in the last 24-48 hours (send feedback 1 day after visit)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const visits = await run(resolvedTenantId, () => findVisitsNeedingFeedbackRequest(twoDaysAgo, oneDayAgo));

    const results: Array<{ visitId: string; success: boolean; error?: string }> = [];
    let requestsSent = 0;
    let errors = 0;

    for (const visit of visits) {
      const result = await sendFeedbackRequest({
        visitId: visit.id,
        tenantId: resolvedTenantId ?? undefined,
        sendSMS: true,
        sendEmail: true,
      });

      results.push({
        visitId: visit.id,
        success: result.success,
        error: result.error,
      });

      if (result.success && result.sent) {
        requestsSent++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: visits.length,
      requestsSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing feedback collection:', error);
    return {
      success: false,
      processed: 0,
      requestsSent: 0,
      errors: 1,
      results: [{ visitId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate feedback SMS
 */
function generateFeedbackSMS(visit: any, clinicName: string, feedbackUrl: string): string {
  const visitDate = new Date(visit.date).toLocaleDateString();
  return `Thank you for visiting ${clinicName} on ${visitDate}. We'd love to hear about your experience! Please share your feedback: ${feedbackUrl}. Your opinion helps us improve our services.`;
}

/**
 * Generate feedback email
 */
function generateFeedbackEmail(visit: any, settings: any, feedbackUrl: string): { subject: string; html: string } {
  const patient = visit.patient as any;
  const provider = visit.provider as any;
  const visitDate = new Date(visit.date).toLocaleDateString();
  const clinicName = settings.clinicName || 'Clinic';

  const subject = `We'd Love Your Feedback - ${clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4CAF50; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>We Value Your Feedback</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Thank you for visiting ${clinicName} on ${visitDate}${provider ? ` with ${provider.name}` : ''}.</p>
          <p>Your feedback is incredibly important to us. It helps us understand how we can better serve you and improve our services.</p>
          <div class="info-box">
            <p>Please take a moment to share your experience:</p>
            <ul>
              <li>How was your visit?</li>
              <li>How would you rate our service?</li>
              <li>Any suggestions for improvement?</li>
            </ul>
          </div>
          <p style="text-align: center;">
            <a href="${feedbackUrl}" class="button">Share Your Feedback</a>
          </p>
          <p>Your feedback will only take a minute and is completely confidential.</p>
          <p>Thank you for helping us provide better care!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}
