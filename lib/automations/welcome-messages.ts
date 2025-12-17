// Welcome Message Automation
// Sends welcome messages to new patients

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface WelcomeMessageOptions {
  patientId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send welcome message to new patient
 */
export async function sendWelcomeMessage(options: WelcomeMessageOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoWelcomeMessages = (settings.automationSettings as any)?.autoWelcomeMessages !== false;

    if (!autoWelcomeMessages) {
      return { success: true, sent: false };
    }

    const patientId = typeof options.patientId === 'string' 
      ? new Types.ObjectId(options.patientId) 
      : options.patientId;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : patient.tenantId;

    const clinicName = settings.clinicName || 'Our Clinic';
    const clinicPhone = settings.clinicPhone || '';
    const clinicEmail = settings.clinicEmail || '';
    const clinicWebsite = settings.clinicWebsite || '';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

    const welcomeMessage = generateWelcomeSMS(patient, clinicName, clinicPhone);
    const emailContent = generateWelcomeEmail(patient, settings, baseUrl);

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
          message: welcomeMessage,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending welcome SMS:', error);
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
        console.error('Error sending welcome email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false) {
      // Note: Patient might not have a user account, so we'll skip in-app notification
      // This could be sent to clinic staff instead if needed
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending welcome message:', error);
    return { 
      success: false,
      sent: false,
      error: error.message || 'Failed to send welcome message' 
    };
  }
}

/**
 * Generate welcome SMS message
 */
function generateWelcomeSMS(patient: any, clinicName: string, clinicPhone: string): string {
  return `Welcome to ${clinicName}! Thank you for registering. Your patient code is ${patient.patientCode || 'N/A'}. ${clinicPhone ? `Call us at ${clinicPhone} to book an appointment.` : 'Visit our website to book an appointment.'} We look forward to serving you!`;
}

/**
 * Generate welcome email
 */
function generateWelcomeEmail(patient: any, settings: any, baseUrl: string): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Our Clinic';
  const clinicAddress = settings.clinicAddress || '';
  const clinicPhone = settings.clinicPhone || '';
  const clinicEmail = settings.clinicEmail || '';
  const clinicWebsite = settings.clinicWebsite || baseUrl;
  const bookingUrl = `${baseUrl}/book`;

  const subject = `Welcome to ${clinicName}!`;

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
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${clinicName}!</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Thank you for registering with ${clinicName}. We're excited to have you as a patient!</p>
          <div class="info-box">
            <p><strong>Your Patient Code:</strong> ${patient.patientCode || 'N/A'}</p>
            <p>Please keep this code for your records. You'll need it when booking appointments or accessing your records.</p>
          </div>
          <h2>What's Next?</h2>
          <p>You can now:</p>
          <ul>
            <li>Book appointments online</li>
            <li>Access your medical records</li>
            <li>View your appointment history</li>
            <li>Receive appointment reminders</li>
          </ul>
          <p style="text-align: center;">
            <a href="${bookingUrl}" class="button">Book an Appointment</a>
          </p>
          ${clinicAddress || clinicPhone || clinicEmail ? `
            <h2>Contact Information</h2>
            ${clinicAddress ? `<p><strong>Address:</strong> ${clinicAddress}</p>` : ''}
            ${clinicPhone ? `<p><strong>Phone:</strong> ${clinicPhone}</p>` : ''}
            ${clinicEmail ? `<p><strong>Email:</strong> ${clinicEmail}</p>` : ''}
          ` : ''}
          ${clinicWebsite ? `<p>Visit our website: <a href="${clinicWebsite}">${clinicWebsite}</a></p>` : ''}
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>If you have questions, please contact us directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

