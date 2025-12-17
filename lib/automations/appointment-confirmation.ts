// Appointment Confirmation Automation
// Automatically confirms appointments based on patient response

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail, generateAppointmentReminderEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface AppointmentConfirmationOptions {
  appointmentId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  confirmationMethod?: 'sms' | 'email' | 'link';
  sendConfirmation?: boolean;
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

    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    // Only send confirmation request for scheduled appointments
    if (appointment.status !== 'scheduled' && appointment.status !== 'pending') {
      return { success: true, sent: false };
    }

    const patient = appointment.patient as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : appointment.tenantId;

    const appointmentDate = new Date(appointment.appointmentDate);
    const appointmentTime = appointment.appointmentTime || 'TBD';
    const [hours, minutes] = appointmentTime.split(':').map(Number);
    const displayTime = hours >= 12 
      ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
      : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

    const doctor = appointment.doctor as any;
    const confirmationCode = generateConfirmationCode(appointment);

    let sent = false;

    // Send SMS confirmation request
    if ((options.confirmationMethod === 'sms' || !options.confirmationMethod) && patient.phone) {
      try {
        const message = `Please confirm your appointment on ${appointmentDate.toLocaleDateString()} at ${displayTime}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Reply YES to confirm, NO to cancel, or RESCHEDULE to reschedule. Code: ${confirmationCode}`;

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
        console.error('Error sending confirmation SMS:', error);
      }
    }

    // Send email confirmation request
    if ((options.confirmationMethod === 'email' || !options.confirmationMethod) && patient.email) {
      try {
        const emailContent = generateConfirmationEmail(appointment, confirmationCode);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending confirmation email:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending confirmation request:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send confirmation request' 
    };
  }
}

/**
 * Process patient confirmation response
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

    const appointmentIdObj = typeof appointmentId === 'string' 
      ? new Types.ObjectId(appointmentId) 
      : appointmentId;

    const appointment = await Appointment.findById(appointmentIdObj)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    if (response === 'yes') {
      // Confirm appointment
      appointment.status = 'confirmed';
      await appointment.save();

      // Send confirmation notification
      const patient = appointment.patient as any;
      if (patient && patient._id) {
        await createNotification({
          userId: patient._id,
          tenantId: tenantId || appointment.tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Appointment Confirmed',
          message: `Your appointment on ${new Date(appointment.appointmentDate).toLocaleDateString()} has been confirmed.`,
          relatedEntity: {
            type: 'appointment',
            id: appointment._id,
          },
          actionUrl: `/appointments/${appointment._id}`,
        }).catch(console.error);
      }

      return { success: true, status: 'confirmed' };
    } else if (response === 'no') {
      // Cancel appointment
      appointment.status = 'cancelled';
      await appointment.save();

      return { success: true, status: 'cancelled' };
    } else if (response === 'reschedule') {
      // Mark for rescheduling
      // In a full implementation, you might want to send a rescheduling link
      return { success: true, status: 'reschedule_requested' };
    }

    return { success: false, error: 'Invalid response' };
  } catch (error: any) {
    console.error('Error processing confirmation response:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to process confirmation response' 
    };
  }
}

/**
 * Generate confirmation code for appointment
 */
function generateConfirmationCode(appointment: any): string {
  // Use appointment code or generate a short code
  if (appointment.appointmentCode) {
    return appointment.appointmentCode.substring(0, 6).toUpperCase();
  }
  return appointment._id.toString().substring(0, 6).toUpperCase();
}

/**
 * Generate confirmation email
 */
function generateConfirmationEmail(appointment: any, confirmationCode: string): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12 
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const subject = `Please Confirm Your Appointment - ${appointmentDate.toLocaleDateString()}`;
  
  // Generate confirmation URLs (these would be actual endpoints in production)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const confirmUrl = `${baseUrl}/api/appointments/${appointment._id}/confirm?code=${confirmationCode}&action=yes`;
  const cancelUrl = `${baseUrl}/api/appointments/${appointment._id}/confirm?code=${confirmationCode}&action=no`;
  const rescheduleUrl = `${baseUrl}/api/appointments/${appointment._id}/confirm?code=${confirmationCode}&action=reschedule`;

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
        .button-reschedule { background-color: #ff9800; color: white; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Please Confirm Your Appointment</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Please confirm your upcoming appointment:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${displayTime}</p>
            <p><strong>Doctor:</strong> ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'TBD'}</p>
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode || confirmationCode}</p>
          </div>
          <p style="text-align: center;">
            <a href="${confirmUrl}" class="button button-confirm">Confirm Appointment</a>
            <a href="${cancelUrl}" class="button button-cancel">Cancel</a>
            <a href="${rescheduleUrl}" class="button button-reschedule">Reschedule</a>
          </p>
          <p>Or reply to this email with "YES" to confirm, "NO" to cancel, or "RESCHEDULE" to reschedule.</p>
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
  const settings = await getSettings();
  const autoConfirmation = (settings.automationSettings as any)?.autoAppointmentConfirmation !== false;

  if (!autoConfirmation) {
    return;
  }

  // Only send confirmation request for scheduled appointments
  if (appointment.status === 'scheduled' || appointment.status === 'pending') {
    await sendConfirmationRequest({
      appointmentId: appointment._id,
      tenantId: appointment.tenantId,
      confirmationMethod: 'email', // Prefer email for confirmation links
    }).catch(console.error);
  }
}

