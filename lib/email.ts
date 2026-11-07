// Email service using Resend
// Set environment variables: RESEND_API_KEY, EMAIL_FROM (on a domain verified in Resend)

import { Resend } from 'resend';

/** Cron and broadcast loops send back to back, so they can outrun Resend's per-second limit. */
const RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 2000;

let client: Resend | null = null;

function getEmailClient(): Resend | null {
  if (!isEmailConfigured()) {
    console.warn('Resend not configured. Email sending will be disabled.');
    return null;
  }
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

function retryWaitMs(headers: Record<string, string> | null, attempt: number): number {
  const seconds = Number(headers?.['retry-after']);
  const wait = seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt;
  return Math.min(wait, MAX_RETRY_WAIT_MS);
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
    /** A string is the file's text, not base64. */
    content?: string | Buffer;
    /** A URL Resend can fetch, not a local file. */
    path?: string;
    contentType?: string;
  }>;
}

/** Escape a value for interpolation into HTML email bodies. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string; skipped?: boolean }> {
  const emailClient = getEmailClient();

  if (!emailClient) {
    // Nothing went out: callers must not record this as delivered.
    return {
      success: false,
      skipped: true,
      error: 'Resend not configured - email not sent',
    };
  }

  try {
    const message = {
      from: process.env.EMAIL_FROM!,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || (options.html ? options.html.replace(/<[^>]*>/g, '') : ''),
      cc: options.cc,
      bcc: options.bcc,
      // Resend reads a string as base64.
      attachments: options.attachments?.map((attachment) => ({
        ...attachment,
        content: typeof attachment.content === 'string' ? Buffer.from(attachment.content) : attachment.content,
      })),
    };

    for (let attempt = 0; ; attempt++) {
      // Resend reports a failed send in the result; it doesn't throw.
      const { data, error, headers } = await emailClient.emails.send(message);

      if (!error) {
        return {
          success: true,
          messageId: data.id,
        };
      }

      // Only the per-second limit clears by waiting. The daily and monthly quotas are also 429s.
      if (error.name === 'rate_limit_exceeded' && attempt < RATE_LIMIT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryWaitMs(headers, attempt)));
        continue;
      }

      console.error('Error sending email:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  } catch (error: any) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>This is a reminder for your upcoming appointment:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${escapeHtml(appointmentTime)}</p>
            <p><strong>Doctor:</strong> ${doctor ? `Dr. ${escapeHtml(doctor.firstName)} ${escapeHtml(doctor.lastName)}` : 'TBD'}</p>
            <p><strong>Appointment Code:</strong> ${escapeHtml(appointment.appointmentCode)}</p>
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

/** Invitation / admin-triggered reset: a single-use link to choose a password. */
export function generateSetPasswordEmail(options: {
  name: string;
  clinicName?: string | null;
  url: string;
  expiresInHours: number;
  kind: 'invite' | 'reset';
}): { subject: string; html: string; text: string } {
  const clinic = options.clinicName?.trim() || 'MyClinicSoft';
  const isInvite = options.kind === 'invite';
  const subject = isInvite ? `You're invited to ${clinic}` : `Set a new password for ${clinic}`;
  const intro = isInvite
    ? `An account has been created for you at ${clinic}. Choose a password to activate it.`
    : `An administrator at ${clinic} has asked you to set a new password.`;
  const outro = `This link can be used once and expires in ${options.expiresInHours} hours. If you did not expect this email, you can ignore it.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0f766e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; background-color: #0f766e; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
        .link { word-break: break-all; font-size: 12px; color: #555; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${escapeHtml(isInvite ? 'Welcome' : 'Set your password')}</h1>
        </div>
        <div class="content">
          <p>Hello ${escapeHtml(options.name)},</p>
          <p>${escapeHtml(intro)}</p>
          <p style="text-align: center;"><a class="button" href="${escapeHtml(options.url)}">Set your password</a></p>
          <p class="link">If the button does not work, copy this link into your browser:<br>${escapeHtml(options.url)}</p>
          <p>${escapeHtml(outro)}</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `Hello ${options.name},\n\n${intro}\n\nSet your password: ${options.url}\n\n${outro}\n`;

  return { subject, html, text };
}

/** The one-time sign-in link for the platform console. */
export function generatePlatformLoginEmail(options: { url: string; expiresInMinutes: number }): { subject: string; html: string; text: string } {
  const subject = 'Your MyClinicSoft platform console sign-in link';
  const intro = 'Someone asked to sign in to the MyClinicSoft platform console with this address.';
  const outro = `This link can be used once and expires in ${options.expiresInMinutes} minutes. If you did not ask for it, you can ignore this email; nobody can sign in without it.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0f766e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; background-color: #0f766e; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
        .link { word-break: break-all; font-size: 12px; color: #555; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Platform console</h1>
        </div>
        <div class="content">
          <p>${escapeHtml(intro)}</p>
          <p style="text-align: center;"><a class="button" href="${escapeHtml(options.url)}">Sign in</a></p>
          <p class="link">If the button does not work, copy this link into your browser:<br>${escapeHtml(options.url)}</p>
          <p>${escapeHtml(outro)}</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `${intro}\n\nSign in: ${options.url}\n\n${outro}\n`;

  return { subject, html, text };
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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Your lab results are now available:</p>
          <div class="info-box">
            <p><strong>Test Type:</strong> ${escapeHtml(testType)}</p>
            <p><strong>Request Code:</strong> ${escapeHtml(labResult.requestCode || 'N/A')}</p>
            <p><strong>Status:</strong> ${escapeHtml(labResult.status)}</p>
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

