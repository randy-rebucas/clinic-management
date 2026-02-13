// Email service using Nodemailer
// Set environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getEmailTransporter(): nodemailer.Transporter | null {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@clinic.com';

  if (!host || !port || !user || !pass) {
    console.warn('SMTP credentials not configured. Email sending will be disabled.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: port === '465', // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
    return transporter;
  } catch (error) {
    console.warn('Failed to create email transporter:', error);
    return null;
  }
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const emailTransporter = getEmailTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@clinic.com';

  if (!emailTransporter) {
    // SMTP not configured - email logged only
    return {
      success: true,
      error: 'SMTP not configured - email logged only',
    };
  }

  try {
    const result = await emailTransporter.sendMail({
      from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || (options.html ? options.html.replace(/<[^>]*>/g, '') : ''),
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error: any) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

export function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

// Email template helpers
export function generateAppointmentReminderEmail(appointment: any): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime || 'TBD';

  const subject = `Appointment Reminder - ${appointmentDate.toLocaleDateString()}`;
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
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Reminder</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>This is a reminder for your upcoming appointment:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${appointmentTime}</p>
            <p><strong>Doctor:</strong> ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'TBD'}</p>
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode}</p>
          </div>
          <p>Please arrive 10 minutes early for your appointment.</p>
          <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
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

export function generateLabResultEmail(labResult: any): { subject: string; html: string } {
  const patient = labResult.patient as any;
  const testType = labResult.request?.testType || 'Lab Test';

  const subject = `Lab Results Available - ${testType}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Lab Results Available</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Your lab results are now available:</p>
          <div class="info-box">
            <p><strong>Test Type:</strong> ${testType}</p>
            <p><strong>Request Code:</strong> ${labResult.requestCode || 'N/A'}</p>
            <p><strong>Status:</strong> ${labResult.status}</p>
          </div>
          <p>Please contact your doctor to discuss the results.</p>
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

