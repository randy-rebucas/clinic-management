// Recurring Appointment Automation
// Automatically creates recurring appointments

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface RecurringAppointmentConfig {
  patientId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: Date;
  endDate?: Date;
  duration?: number; // in minutes
  reason?: string;
  notes?: string;
  tenantId?: Types.ObjectId;
  sendNotification?: boolean;
}

export interface RecurringAppointmentOptions {
  appointmentId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  createNext?: boolean;
  sendNotification?: boolean;
}

/**
 * Create recurring appointment configuration
 */
export async function createRecurringConfig(config: RecurringAppointmentConfig): Promise<{
  success: boolean;
  configId?: string;
  error?: string;
}> {
  try {
    await connectDB();

    // Store recurring config (you might want to create a RecurringAppointment model)
    // For now, we'll store it in appointment notes or a separate field
    // This is a simplified implementation
    
    return { success: true, configId: 'config-' + Date.now() };
  } catch (error: any) {
    console.error('Error creating recurring config:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create recurring config' 
    };
  }
}

/**
 * Calculate next appointment date based on frequency
 */
export function calculateNextAppointmentDate(
  lastAppointmentDate: Date,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
): Date {
  const nextDate = new Date(lastAppointmentDate);

  switch (frequency) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  return nextDate;
}

/**
 * Create next appointment in recurring series
 */
export async function createNextRecurringAppointment(
  lastAppointment: any,
  config: RecurringAppointmentConfig
): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoRecurringAppointments = (settings.automationSettings as any)?.autoRecurringAppointments !== false;

    if (!autoRecurringAppointments) {
      return { success: true };
    }

    // Calculate next appointment date
    const lastDate = lastAppointment.appointmentDate 
      ? new Date(lastAppointment.appointmentDate)
      : lastAppointment.scheduledAt 
      ? new Date(lastAppointment.scheduledAt)
      : new Date();

    const nextDate = calculateNextAppointmentDate(lastDate, config.frequency);

    // Check if end date has passed
    if (config.endDate && nextDate > config.endDate) {
      return { success: true }; // Series complete
    }

    // Check if appointment already exists
    const existingQuery: any = {
      patient: config.patientId,
      appointmentDate: {
        $gte: new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()),
        $lt: new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate() + 1),
      },
      status: { $nin: ['cancelled', 'no-show'] },
    };

    if (config.tenantId) {
      existingQuery.tenantId = config.tenantId;
    }

    const existing = await Appointment.findOne(existingQuery);
    if (existing) {
      return { success: true }; // Already exists
    }

    // Generate appointment code
    const codeQuery: any = { appointmentCode: { $exists: true, $ne: null } };
    if (config.tenantId) {
      codeQuery.tenantId = config.tenantId;
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const lastAppointmentByCode = await Appointment.findOne(codeQuery)
      .sort({ appointmentCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastAppointmentByCode?.appointmentCode) {
      const match = lastAppointmentByCode.appointmentCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

    // Create new appointment
    const appointmentData: any = {
      tenantId: config.tenantId,
      patient: config.patientId,
      doctor: config.doctorId,
      provider: config.doctorId,
      appointmentCode,
      appointmentDate: nextDate,
      scheduledAt: nextDate,
      status: 'scheduled',
      reason: config.reason || `Recurring appointment (${config.frequency})`,
      notes: `${config.notes || ''}\n[Recurring appointment - created automatically]`.trim(),
      duration: config.duration || 30,
    };

    const appointment = await Appointment.create(appointmentData);

    // Populate appointment
    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName');

    // Notify patient
    const patient = appointment.patient as any;
    if (patient && config.sendNotification !== false) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
      const clinicName = settings.clinicName || 'Clinic';

      // Send SMS
      if (patient.phone) {
        try {
          let phoneNumber = patient.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const message = `Your next recurring appointment has been scheduled for ${nextDate.toLocaleDateString()}. Appointment Code: ${appointmentCode}. - ${clinicName}`;

          await sendSMS({
            to: phoneNumber,
            message,
          });
        } catch (error) {
          console.error('Error sending recurring appointment SMS:', error);
        }
      }

      // Send email
      if (patient.email) {
        try {
          const emailContent = generateRecurringAppointmentEmail(appointment, settings);
          await sendEmail({
            to: patient.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        } catch (error) {
          console.error('Error sending recurring appointment email:', error);
        }
      }

      // Send notification
      try {
        await createNotification({
          userId: patient._id,
          tenantId: config.tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Recurring Appointment Scheduled',
          message: `Your next appointment has been automatically scheduled for ${nextDate.toLocaleDateString()}.`,
          relatedEntity: {
            type: 'appointment',
            id: appointment._id,
          },
          actionUrl: `/appointments/${appointment._id}`,
        });
      } catch (error) {
        console.error('Error creating recurring appointment notification:', error);
      }
    }

    return { success: true, appointment };
  } catch (error: any) {
    console.error('Error creating next recurring appointment:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create next recurring appointment' 
    };
  }
}

/**
 * Process all completed recurring appointments and create next ones
 * This should be called by a cron job
 */
export async function processRecurringAppointments(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  created: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; created?: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoRecurringAppointments = (settings.automationSettings as any)?.autoRecurringAppointments !== false;

    if (!autoRecurringAppointments) {
      return { success: true, processed: 0, created: 0, errors: 0, results: [] };
    }

    // Find completed appointments with recurring indicators
    // Look for appointments with notes containing "recurring" or specific recurring flags
    const query: any = {
      status: 'completed',
      notes: { $regex: /recurring|recur/i },
      // You might want to add a recurringAppointmentId field to track series
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    // Find appointments completed in the last 7 days (to catch any missed)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    query.updatedAt = { $gte: sevenDaysAgo };

    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');

    const results: Array<{ appointmentId: string; success: boolean; created?: boolean; error?: string }> = [];
    let created = 0;
    let errors = 0;

    for (const appointment of appointments) {
      // Extract recurring config from notes or appointment data
      // This is simplified - in production, you'd have a proper recurring config model
      const frequency = extractFrequencyFromNotes(appointment.notes || '') || 'monthly';
      
      const config: RecurringAppointmentConfig = {
        patientId: appointment.patient as Types.ObjectId,
        doctorId: appointment.doctor as Types.ObjectId || appointment.provider as Types.ObjectId,
        frequency: frequency as any,
        startDate: appointment.appointmentDate || appointment.scheduledAt || new Date(),
        duration: appointment.duration || 30,
        reason: appointment.reason,
        notes: appointment.notes,
        tenantId: appointment.tenantId,
      };

      const result = await createNextRecurringAppointment(appointment, {
        ...config,
        sendNotification: true,
      });

      results.push({
        appointmentId: appointment._id.toString(),
        success: result.success,
        created: !!result.appointment,
        error: result.error,
      });

      if (result.success && result.appointment) {
        created++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: appointments.length,
      created,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing recurring appointments:', error);
    return {
      success: false,
      processed: 0,
      created: 0,
      errors: 1,
      results: [{ appointmentId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Extract frequency from appointment notes
 */
function extractFrequencyFromNotes(notes: string): string | null {
  const frequencyPatterns = {
    weekly: /weekly|every week|each week/i,
    biweekly: /biweekly|bi-weekly|every two weeks|every 2 weeks/i,
    monthly: /monthly|every month|each month/i,
    quarterly: /quarterly|every quarter|every 3 months/i,
    yearly: /yearly|annually|every year|each year/i,
  };

  for (const [frequency, pattern] of Object.entries(frequencyPatterns)) {
    if (pattern.test(notes)) {
      return frequency;
    }
  }

  return null;
}

/**
 * Generate recurring appointment email
 */
function generateRecurringAppointmentEmail(appointment: any, settings: any): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate || appointment.scheduledAt).toLocaleDateString();
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const clinicName = settings.clinicName || 'Clinic';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

  const subject = `Recurring Appointment Scheduled - ${clinicName}`;

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
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Recurring Appointment Scheduled</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Your next recurring appointment has been automatically scheduled:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate}</p>
            <p><strong>Time:</strong> ${appointmentTime}</p>
            ${doctor ? `<p><strong>Doctor:</strong> Dr. ${doctor.firstName} ${doctor.lastName}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode}</p>
          </div>
          <p>This appointment was automatically created as part of your recurring appointment series.</p>
          <p style="text-align: center;">
            <a href="${baseUrl}/appointments/${appointment._id}" class="button">View Appointment</a>
          </p>
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

