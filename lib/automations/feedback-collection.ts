// Appointment Feedback Collection Automation
// Automatically collects patient feedback after visits

import { randomBytes } from 'crypto';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  delivered,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface FeedbackCollectionOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
}

/** Ask for feedback from 1 day after the visit; older visits up to this age are caught up. */
const MAX_VISIT_AGE_DAYS = 7;

/**
 * Send feedback request to patient
 */
export async function sendFeedbackRequest(options: FeedbackCollectionOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, sent: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoFeedbackCollection')) {
      return { success: true, sent: false };
    }

    const visit = await Visit.findOne({ _id: options.visitId, tenantId })
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name');

    if (!visit) {
      return { success: false, sent: false, error: 'Visit not found' };
    }

    if (visit.status !== 'closed') {
      return { success: true, sent: false };
    }

    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    // Claim the visit before sending so concurrent/rerun jobs can't send twice.
    let token = (visit as any).feedbackToken as string | undefined;
    const claim = await Visit.updateOne(
      { _id: visit._id, tenantId, feedbackRequested: { $ne: true } },
      { $set: { feedbackRequested: true, ...(token ? {} : { feedbackToken: (token = randomBytes(24).toString('hex')) }) } }
    );
    if (claim.modifiedCount === 0) {
      return { success: true, sent: false };
    }

    const tz = await getTenantTimezone(tenantId);
    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const feedbackUrl = `${baseUrl}/feedback/${token}`;
    const visitDate = displayDate(visit.date, tz);

    let sent = false;

    if (options.sendSMS !== false && patient.phone) {
      try {
        const smsResult = await sendSMS({
          to: patient.phone,
          message: generateFeedbackSMS(visitDate, clinicName, feedbackUrl),
        });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending feedback SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateFeedbackEmail(visit, visitDate, settings, feedbackUrl);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        if (delivered(emailResult)) sent = true;
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
      error: 'Failed to send feedback request',
    };
  }
}

type FeedbackResult = {
  success: boolean;
  processed: number;
  requestsSent: number;
  errors: number;
  results: Array<{ visitId: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<FeedbackResult> {
  const out: FeedbackResult = { success: true, processed: 0, requestsSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoFeedbackCollection')) return out;

  const now = Date.now();
  const visits = await Visit.find({
    tenantId: tenant.tenantObjectId,
    status: 'closed',
    date: {
      $gte: new Date(now - MAX_VISIT_AGE_DAYS * 24 * 60 * 60 * 1000),
      $lte: new Date(now - 24 * 60 * 60 * 1000),
    },
    feedbackRequested: { $ne: true },
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();

  for (const visit of visits as any[]) {
    out.processed++;
    try {
      const result = await sendFeedbackRequest({
        visitId: visit._id,
        tenantId: tenant.tenantObjectId,
        sendSMS: true,
        sendEmail: true,
      });
      out.results.push({ visitId: String(visit._id), success: result.success, error: result.error });
      if (result.success && result.sent) out.requestsSent++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ visitId: String(visit._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process all completed visits and send feedback requests.
 * Without a tenantId every active tenant is processed.
 */
export async function processFeedbackCollection(tenantId?: string | Types.ObjectId): Promise<FeedbackResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: FeedbackResult = { success: runs.every((r) => r.success), processed: 0, requestsSent: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.requestsSent += run.result.requestsSent;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing feedback collection:', error);
    return {
      success: false,
      processed: 0,
      requestsSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateFeedbackSMS(visitDate: string, clinicName: string, feedbackUrl: string): string {
  return `Thank you for visiting ${clinicName} on ${visitDate}. We'd love to hear about your experience! Please share your feedback: ${feedbackUrl}. Your opinion helps us improve our services.`;
}

function generateFeedbackEmail(visit: any, visitDate: string, settings: any, feedbackUrl: string): { subject: string; html: string } {
  const patient = visit.patient as any;
  const provider = visit.provider as any;
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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Thank you for visiting ${escapeHtml(clinicName)} on ${escapeHtml(visitDate)}${provider ? ` with ${escapeHtml(provider.name)}` : ''}.</p>
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
            <a href="${escapeHtml(feedbackUrl)}" class="button">Share Your Feedback</a>
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
