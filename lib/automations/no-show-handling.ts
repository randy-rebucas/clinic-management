// No-Show Handling Automation
// Automatically handles appointments marked as no-show

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAppointmentById, updateAppointment } from '@/lib/data/appointment';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface NoShowHandlingOptions {
  appointmentId: string;
  tenantId?: string;
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
    const tenantId = options.tenantId ? String(options.tenantId) : undefined;
    const appointmentId = String(options.appointmentId);

    return await run(tenantId, async () => {
      const settings = await getSettings(tenantId);
      const autoNoShowHandling = (settings.automationSettings as any)?.autoNoShowHandling !== false;

      if (!autoNoShowHandling) {
        return { success: true, handled: false };
      }

      const appointment = await getAppointmentById(appointmentId);

      if (!appointment) {
        return { success: false, handled: false, error: 'Appointment not found' };
      }

      // Only handle if status is no-show
      if (appointment.status !== 'no_show') {
        return { success: true, handled: false };
      }

      const patient = appointment.patient as any;
      if (!patient) {
        return { success: false, handled: false, error: 'Patient not found' };
      }

      const rescheduled = false;

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
      if (options.sendNotification !== false && patient.id) {
        try {
          await createNotification({
            userId: patient.id,
            type: 'appointment',
            priority: 'normal',
            title: 'Missed Appointment',
            message: 'We noticed you missed your appointment. Would you like to reschedule?',
            relatedEntityType: 'appointment',
            relatedEntityId: appointment.id,
            actionUrl: `/appointments?reschedule=${appointment.id}`,
          });
        } catch (error) {
          console.error('Error creating no-show notification:', error);
        }
      }

      return { success: true, handled: true, rescheduled };
    });
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
export async function processNoShows(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  handled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; error?: string }>;
}> {
  try {
    const tId = tenantId ? String(tenantId) : undefined;

    return await run(tId, async () => {
      const settings = await getSettings(tId);
      const autoNoShowHandling = (settings.automationSettings as any)?.autoNoShowHandling !== false;

      if (!autoNoShowHandling) {
        return { success: true, processed: 0, handled: 0, errors: 0, results: [] };
      }

      // Find appointments that should be marked as no-show
      // (appointment time has passed, status is still scheduled/confirmed)
      const now = new Date();

      const appointments = await prisma.appointment.findMany({
        where: {
          ...(tId ? { tenantId: tId } : {}),
          status: { in: ['scheduled', 'confirmed'] as any },
          appointmentDate: { lt: now },
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      });

      const results: Array<{ appointmentId: string; success: boolean; error?: string }> = [];
      let handled = 0;
      let errors = 0;

      for (const appointment of appointments) {
        // Check if appointment time has actually passed
        let appointmentDateTime: Date | null = null;

        if (appointment.appointmentDate && appointment.appointmentTime) {
          const [hours, minutes] = appointment.appointmentTime.split(':').map(Number);
          appointmentDateTime = new Date(appointment.appointmentDate);
          appointmentDateTime.setHours(hours, minutes, 0, 0);
        } else if (appointment.appointmentDate) {
          appointmentDateTime = new Date(appointment.appointmentDate);
        }

        if (!appointmentDateTime || appointmentDateTime > now) {
          continue; // Appointment hasn't passed yet
        }

        // Mark as no-show
        await updateAppointment(appointment.id, { status: 'no_show' } as any);

        // Handle no-show
        const result = await handleNoShow({
          appointmentId: appointment.id,
          tenantId: appointment.tenantId ?? undefined,
          autoReschedule: false, // Don't auto-reschedule, just offer
          sendNotification: true,
          sendEmail: true,
          sendSMS: true,
        });

        results.push({
          appointmentId: appointment.id,
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
    });
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
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const rescheduleUrl = `${baseUrl}/book?reschedule=${appointment.id}`;

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
  const rescheduleUrl = `${baseUrl}/book?reschedule=${appointment.id}`;

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
