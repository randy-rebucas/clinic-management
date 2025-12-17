// Appointment Feedback Collection Automation
// Automatically collects patient feedback after visits

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface FeedbackCollectionOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
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
    await connectDB();

    const settings = await getSettings();
    const autoFeedbackCollection = (settings.automationSettings as any)?.autoFeedbackCollection !== false;

    if (!autoFeedbackCollection) {
      return { success: true, sent: false };
    }

    const visitId = typeof options.visitId === 'string' 
      ? new Types.ObjectId(options.visitId) 
      : options.visitId;

    const visit = await Visit.findById(visitId)
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name');

    if (!visit) {
      return { success: false, error: 'Visit not found' };
    }

    // Only send feedback request for closed visits
    if (visit.status !== 'closed') {
      return { success: true, sent: false };
    }

    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : visit.tenantId;

    const clinicName = settings.clinicName || 'Our Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const feedbackUrl = `${baseUrl}/feedback?visit=${visit._id}&code=${visit.visitCode}`;

    const feedbackMessage = generateFeedbackSMS(visit, clinicName, feedbackUrl);
    const emailContent = generateFeedbackEmail(visit, settings, feedbackUrl);

    let sent = false;

    // Send SMS if enabled and phone available
    if (options.sendSMS !== false && patient.phone) {
      try {
        let phoneNumber = patient.phone.trim();
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
      error: error.message || 'Failed to send feedback request' 
    };
  }
}

/**
 * Process all completed visits and send feedback requests
 * This should be called by a cron job
 */
export async function processFeedbackCollection(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  requestsSent: number;
  errors: number;
  results: Array<{ visitId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoFeedbackCollection = (settings.automationSettings as any)?.autoFeedbackCollection !== false;

    if (!autoFeedbackCollection) {
      return { success: true, processed: 0, requestsSent: 0, errors: 0, results: [] };
    }

    // Find visits closed in the last 24-48 hours (send feedback 1 day after visit)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const query: any = {
      status: 'closed',
      date: { $gte: twoDaysAgo, $lte: oneDayAgo }, // Closed 1-2 days ago
      feedbackRequested: { $ne: true }, // Not already requested
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const visits = await Visit.find(query)
      .populate('patient', 'firstName lastName email phone');

    const results: Array<{ visitId: string; success: boolean; error?: string }> = [];
    let requestsSent = 0;
    let errors = 0;

    for (const visit of visits) {
      const result = await sendFeedbackRequest({
        visitId: visit._id,
        tenantId: visit.tenantId,
        sendSMS: true,
        sendEmail: true,
      });

      // Mark feedback as requested (you might want to add this field to Visit model)
      // visit.feedbackRequested = true;
      // await visit.save();

      results.push({
        visitId: visit._id.toString(),
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

