// Appointment Confirmation Automation
// Automatically confirms appointments based on patient response

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { buildAppointmentActionUrl } from '@/lib/appointment-links';
import { Types } from 'mongoose';
import { getTenantTimezone, displayDate, displayTime, delivered } from './shared';

export interface AppointmentConfirmationOptions {
  appointmentId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  confirmationMethod?: 'sms' | 'email' | 'link';
  sendConfirmation?: boolean;
  sendPush?: boolean;
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
}

/**
 * Send appointment confirmation request to patient
 */
export async function sendConfirmationRequest(options: AppointmentConfirmationOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const appointmentId = typeof options.appointmentId === 'string'
      ? new Types.ObjectId(options.appointmentId)
      : options.appointmentId;

    const filter: Record<string, unknown> = { _id: appointmentId };
    if (options.tenantId) filter.tenantId = new Types.ObjectId(String(options.tenantId));

    const appointment = await Appointment.findOne(filter)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, sent: false, error: 'Appointment not found' };
    }

    // Only send confirmation request for scheduled appointments
    if (appointment.status !== 'scheduled' && appointment.status !== 'pending') {
      return { success: true, sent: false };
    }

    const patient = appointment.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const tz = await getTenantTimezone(appointment.tenantId);
    const dateText = displayDate(appointment.appointmentDate || appointment.scheduledAt, tz);
    const timeText = displayTime(appointment.appointmentTime);
    const doctor = appointment.doctor as any;

    let sent = false;

    if ((options.confirmationMethod === 'sms' || !options.confirmationMethod) && patient.phone) {
      try {
        const confirmUrl = buildAppointmentActionUrl(appBaseUrl(), appointment._id.toString(), 'yes');
        const message = `Please confirm your appointment on ${dateText} at ${timeText}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Confirm: ${confirmUrl}`;
        const smsResult = await sendSMS({ to: patient.phone, message });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending confirmation SMS:', error);
      }
    }

    if ((options.confirmationMethod === 'email' || !options.confirmationMethod) && patient.email) {
      try {
        const emailContent = generateConfirmationEmail(appointment, dateText, timeText);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending confirmation email:', error);
      }
    }

    if (options.sendPush !== false && patient._id) {
      try {
        const pushResult = await sendPushToPatientDevices(patient._id.toString(), {
          title: 'Confirm Your Appointment',
          body: `${dateText} at ${timeText}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Tap to confirm.`,
          tag: `appointment-confirm-${appointment._id}`,
          url: `/appointments/${appointment._id}`,
        });
        if (pushResult.sent) sent = true;
      } catch (error) {
        console.error('Error sending confirmation push notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending confirmation request:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send confirmation request',
    };
  }
}

/**
 * Process patient confirmation response.
 * Callers must have authenticated the request (signed link token or staff session).
 */
export async function processConfirmationResponse(
  appointmentId: string | Types.ObjectId,
  response: 'yes' | 'no' | 'reschedule',
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  status?: string;
  error?: string;
}> {
  try {
    await connectDB();

    if (!Types.ObjectId.isValid(String(appointmentId))) {
      return { success: false, error: 'Appointment not found' };
    }
    const filter: Record<string, unknown> = { _id: new Types.ObjectId(String(appointmentId)) };
    if (tenantId) filter.tenantId = new Types.ObjectId(String(tenantId));

    const appointment = await Appointment.findOne(filter);
    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    const open = ['pending', 'scheduled', 'confirmed', 'rescheduled'];
    if (!open.includes(appointment.status)) {
      return { success: false, status: appointment.status, error: 'This appointment can no longer be changed' };
    }

    if (response === 'yes') {
      if (appointment.status !== 'confirmed') {
        appointment.status = 'confirmed';
        await appointment.save();
      }
      return { success: true, status: 'confirmed' };
    } else if (response === 'no') {
      appointment.status = 'cancelled';
      await appointment.save();
      return { success: true, status: 'cancelled' };
    } else if (response === 'reschedule') {
      return { success: true, status: 'reschedule_requested' };
    }

    return { success: false, error: 'Invalid response' };
  } catch (error: any) {
    console.error('Error processing confirmation response:', error);
    return {
      success: false,
      error: 'Failed to process confirmation response',
    };
  }
}

function generateConfirmationEmail(appointment: any, dateText: string, timeText: string): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const id = appointment._id.toString();
  const confirmUrl = buildAppointmentActionUrl(appBaseUrl(), id, 'yes');
  const cancelUrl = buildAppointmentActionUrl(appBaseUrl(), id, 'no');

  const subject = `Please Confirm Your Appointment - ${dateText}`;

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
        .button { display: inline-block; padding: 12px 24px; margin: 10px 5px; text-decoration: none; border-radius: 4px; font-weight: bold; }
        .button-confirm { background-color: #4CAF50; color: white; }
        .button-cancel { background-color: #f44336; color: white; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Please Confirm Your Appointment</h1>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Please confirm your upcoming appointment:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${escapeHtml(dateText)}</p>
            <p><strong>Time:</strong> ${escapeHtml(timeText)}</p>
            <p><strong>Doctor:</strong> ${doctor ? `Dr. ${escapeHtml(doctor.firstName)} ${escapeHtml(doctor.lastName)}` : 'TBD'}</p>
            ${appointment.appointmentCode ? `<p><strong>Appointment Code:</strong> ${escapeHtml(appointment.appointmentCode)}</p>` : ''}
          </div>
          <p style="text-align: center;">
            <a href="${escapeHtml(confirmUrl)}" class="button button-confirm">Confirm Appointment</a>
            <a href="${escapeHtml(cancelUrl)}" class="button button-cancel">Cancel</a>
          </p>
          <p>To reschedule, please contact the clinic.</p>
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

/**
 * Enhance appointment reminders with confirmation requests
 */
export async function enhanceReminderWithConfirmation(appointment: any): Promise<void> {
  if (!appointment?.tenantId) return;
  const settings = await getSettings(appointment.tenantId);
  const autoConfirmation = (settings.automationSettings as any)?.autoAppointmentConfirmation !== false;

  if (!autoConfirmation) {
    return;
  }

  if (appointment.status === 'scheduled' || appointment.status === 'pending') {
    await sendConfirmationRequest({
      appointmentId: appointment._id,
      tenantId: appointment.tenantId,
      confirmationMethod: 'email',
    }).catch(console.error);
  }
}
