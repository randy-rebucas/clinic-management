// No-Show Handling Automation
// Automatically handles appointments marked as no-show

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface NoShowHandlingOptions {
  appointmentId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  autoReschedule?: boolean;
  sendNotification?: boolean;
  sendEmail?: boolean;
  sendSMS?: boolean;
}

/**
 * Handle no-show appointment
 */
export async function handleNoShow(options: NoShowHandlingOptions): Promise<{
  success: boolean;
  handled: boolean;
  rescheduled?: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoNoShowHandling = (settings.automationSettings as any)?.autoNoShowHandling !== false;

    if (!autoNoShowHandling) {
      return { success: true, handled: false };
    }

    const appointmentId = typeof options.appointmentId === 'string' 
      ? new Types.ObjectId(options.appointmentId) 
      : options.appointmentId;

    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    // Only handle if status is no-show
    if (appointment.status !== 'no-show') {
      return { success: true, handled: false };
    }

    const patient = appointment.patient as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : appointment.tenantId;

    let rescheduled = false;

    // Send apology and rescheduling offer
    const message = generateNoShowMessage(appointment);
    const emailContent = generateNoShowEmail(appointment, settings);

    // Send SMS
    if (options.sendSMS !== false && patient.phone) {
      try {
        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        await sendSMS({
          to: phoneNumber,
          message,
        });
      } catch (error) {
        console.error('Error sending no-show SMS:', error);
      }
    }

    // Send email
    if (options.sendEmail !== false && patient.email) {
      try {
        await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      } catch (error) {
        console.error('Error sending no-show email:', error);
      }
    }

    // Send notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Missed Appointment',
          message: 'We noticed you missed your appointment. Would you like to reschedule?',
          relatedEntity: {
            type: 'appointment',
            id: appointment._id,
          },
          actionUrl: `/appointments?reschedule=${appointment._id}`,
        });
      } catch (error) {
        console.error('Error creating no-show notification:', error);
      }
    }

    return { success: true, handled: true, rescheduled };
  } catch (error: any) {
    console.error('Error handling no-show:', error);
    return { 
      success: false, 
      handled: false,
      error: error.message || 'Failed to handle no-show' 
    };
  }
}

/**
 * Process all no-show appointments and handle them
 * This should be called by a cron job
 */
export async function processNoShows(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  handled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoNoShowHandling = (settings.automationSettings as any)?.autoNoShowHandling !== false;

    if (!autoNoShowHandling) {
      return { success: true, processed: 0, handled: 0, errors: 0, results: [] };
    }

    // Find appointments that should be marked as no-show
    // (appointment time has passed, status is still scheduled/confirmed)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const query: any = {
      status: { $in: ['scheduled', 'confirmed'] },
      $or: [
        { 
          scheduledAt: { $lt: oneHourAgo }
        },
        {
          appointmentDate: { $lt: now },
          appointmentTime: { $exists: true }
        }
      ],
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName email phone');

    const results: Array<{ appointmentId: string; success: boolean; error?: string }> = [];
    let handled = 0;
    let errors = 0;

    for (const appointment of appointments) {
      // Check if appointment time has actually passed
      let appointmentDateTime: Date | null = null;
      
      if (appointment.scheduledAt) {
        appointmentDateTime = new Date(appointment.scheduledAt);
      } else if (appointment.appointmentDate && appointment.appointmentTime) {
        const [hours, minutes] = appointment.appointmentTime.split(':').map(Number);
        appointmentDateTime = new Date(appointment.appointmentDate);
        appointmentDateTime.setHours(hours, minutes, 0, 0);
      }

      if (!appointmentDateTime || appointmentDateTime > now) {
        continue; // Appointment hasn't passed yet
      }

      // Mark as no-show
      appointment.status = 'no-show';
      await appointment.save();

      // Handle no-show
      const result = await handleNoShow({
        appointmentId: appointment._id,
        tenantId: appointment.tenantId,
        autoReschedule: false, // Don't auto-reschedule, just offer
        sendNotification: true,
        sendEmail: true,
        sendSMS: true,
      });

      results.push({
        appointmentId: appointment._id.toString(),
        success: result.success,
        error: result.error,
      });

      if (result.success && result.handled) {
        handled++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: appointments.length,
      handled,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing no-shows:', error);
    return {
      success: false,
      processed: 0,
      handled: 0,
      errors: 1,
      results: [{ appointmentId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate no-show message
 */
function generateNoShowMessage(appointment: any): string {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const rescheduleUrl = `${baseUrl}/book?reschedule=${appointment._id}`;

  return `We noticed you missed your appointment on ${appointmentDate}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. We understand things come up. Would you like to reschedule? Visit ${rescheduleUrl} or reply RESCHEDULE.`;
}

/**
 * Generate no-show email
 */
function generateNoShowEmail(appointment: any, settings: any): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString();
  const clinicName = settings.clinicName || 'Clinic';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const rescheduleUrl = `${baseUrl}/book?reschedule=${appointment._id}`;

  const subject = `Missed Appointment - ${clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #ff9800; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Missed Appointment</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>We noticed you missed your appointment scheduled for ${appointmentDate}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}.</p>
          <p>We understand that things come up, and we're here to help you reschedule.</p>
          <div class="info-box">
            <p><strong>Original Appointment:</strong></p>
            <p>Date: ${appointmentDate}</p>
            <p>Time: ${appointment.appointmentTime || 'TBD'}</p>
            <p>Appointment Code: ${appointment.appointmentCode}</p>
          </div>
          <p style="text-align: center;">
            <a href="${rescheduleUrl}" class="button">Reschedule Appointment</a>
          </p>
          <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
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

