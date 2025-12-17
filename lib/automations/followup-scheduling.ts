// Follow-up Visit Scheduling Automation
// Automatically schedules follow-up visits

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface FollowupSchedulingOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendNotification?: boolean;
  sendEmail?: boolean;
  sendSMS?: boolean;
}

/**
 * Schedule follow-up appointment for a visit
 */
export async function scheduleFollowupAppointment(options: FollowupSchedulingOptions): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
  skipped?: boolean;
  reason?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoFollowupScheduling = (settings.automationSettings as any)?.autoFollowupScheduling !== false;

    if (!autoFollowupScheduling) {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Automatic follow-up scheduling is disabled' 
      };
    }

    const visitId = typeof options.visitId === 'string' 
      ? new Types.ObjectId(options.visitId) 
      : options.visitId;

    const visit = await Visit.findById(visitId)
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'firstName lastName');

    if (!visit) {
      return { success: false, error: 'Visit not found' };
    }

    // Check if visit has follow-up date
    if (!visit.followUpDate) {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Visit does not have a follow-up date' 
      };
    }

    // Check if visit is closed
    if (visit.status !== 'closed') {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Visit is not closed' 
      };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : visit.tenantId;

    // Check if appointment already exists for this follow-up
    const followUpDate = new Date(visit.followUpDate);
    const existingAppointment = await Appointment.findOne({
      tenantId,
      patient: visit.patient,
      appointmentDate: {
        $gte: new Date(followUpDate.setHours(0, 0, 0, 0)),
        $lt: new Date(followUpDate.setHours(23, 59, 59, 999)),
      },
      status: { $in: ['scheduled', 'confirmed', 'pending'] },
    });

    if (existingAppointment) {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Appointment already exists for follow-up date',
        appointment: existingAppointment
      };
    }

    const patient = visit.patient as any;
    const provider = visit.provider as any;

    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    // Generate appointment code
    const codeQuery: any = { appointmentCode: { $exists: true, $ne: null } };
    if (tenantId) {
      codeQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const lastAppointment = await Appointment.findOne(codeQuery)
      .sort({ appointmentCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastAppointment?.appointmentCode) {
      const match = lastAppointment.appointmentCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

    // Create appointment for follow-up
    const appointmentData: any = {
      tenantId,
      patient: patient._id,
      doctor: provider?._id,
      provider: provider?._id,
      appointmentCode,
      appointmentDate: followUpDate,
      appointmentTime: '09:00', // Default time, can be configured
      status: 'scheduled',
      reason: 'Follow-up visit',
      notes: `Follow-up appointment for visit ${visit.visitCode}`,
      duration: 30, // Default 30 minutes
    };

    const appointment = await Appointment.create(appointmentData);

    // Populate appointment
    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName');
    await appointment.populate('provider', 'name email');

    // Send notifications
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Follow-up Appointment Scheduled',
          message: `Your follow-up appointment has been scheduled for ${followUpDate.toLocaleDateString()}. Appointment Code: ${appointmentCode}.`,
          relatedEntity: {
            type: 'appointment',
            id: appointment._id,
          },
          actionUrl: `/appointments/${appointment._id}`,
        });
      } catch (error) {
        console.error('Error creating follow-up appointment notification:', error);
      }
    }

    // Send email
    if (options.sendEmail && patient.email) {
      try {
        const emailContent = generateFollowupEmail(visit, appointment);
        await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      } catch (error) {
        console.error('Error sending follow-up appointment email:', error);
      }
    }

    // Send SMS
    if (options.sendSMS && patient.phone) {
      try {
        const message = `Your follow-up appointment has been scheduled for ${followUpDate.toLocaleDateString()} at 9:00 AM. Appointment Code: ${appointmentCode}. We'll send a reminder closer to the date.`;

        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        await sendSMS({
          to: phoneNumber,
          message,
        });
      } catch (error) {
        console.error('Error sending follow-up appointment SMS:', error);
      }
    }

    return { success: true, appointment };
  } catch (error: any) {
    console.error('Error scheduling follow-up appointment:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to schedule follow-up appointment' 
    };
  }
}

/**
 * Process all visits with follow-up dates and schedule appointments
 * This should be called by a cron job
 */
export async function processFollowupScheduling(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  scheduled: number;
  errors: number;
  results: Array<{ visitId: string; success: boolean; error?: string; appointmentId?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoFollowupScheduling = (settings.automationSettings as any)?.autoFollowupScheduling !== false;

    if (!autoFollowupScheduling) {
      return { success: true, processed: 0, scheduled: 0, errors: 0, results: [] };
    }

    // Find visits with follow-up dates that are closed but don't have appointments yet
    const query: any = {
      status: 'closed',
      followUpDate: { $exists: true, $ne: null },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const visits = await Visit.find(query)
      .populate('patient', 'firstName lastName')
      .populate('provider', 'name');

    const results: Array<{ visitId: string; success: boolean; error?: string; appointmentId?: string }> = [];
    let scheduled = 0;
    let errors = 0;

    for (const visit of visits) {
      // Check if appointment already exists
      const followUpDate = new Date(visit.followUpDate!);
      const existingAppointment = await Appointment.findOne({
        tenantId: visit.tenantId,
        patient: visit.patient,
        appointmentDate: {
          $gte: new Date(followUpDate.setHours(0, 0, 0, 0)),
          $lt: new Date(followUpDate.setHours(23, 59, 59, 999)),
        },
        status: { $in: ['scheduled', 'confirmed', 'pending'] },
      });

      if (existingAppointment) {
        continue; // Skip if appointment already exists
      }

      const result = await scheduleFollowupAppointment({
        visitId: visit._id,
        tenantId: visit.tenantId,
        sendNotification: true,
        sendEmail: true,
        sendSMS: true,
      });

      results.push({
        visitId: visit._id.toString(),
        success: result.success,
        error: result.error,
        appointmentId: result.appointment?._id?.toString(),
      });

      if (result.success && result.appointment) {
        scheduled++;
      } else if (!result.success && !result.skipped) {
        errors++;
      }
    }

    return {
      success: true,
      processed: visits.length,
      scheduled,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing follow-up scheduling:', error);
    return {
      success: false,
      processed: 0,
      scheduled: 0,
      errors: 1,
      results: [{ visitId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate follow-up appointment email
 */
function generateFollowupEmail(visit: any, appointment: any): { subject: string; html: string } {
  const patient = visit.patient as any;
  const provider = visit.provider as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime || '9:00 AM';

  const subject = `Follow-up Appointment Scheduled - ${appointmentDate.toLocaleDateString()}`;

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
          <h1>Follow-up Appointment Scheduled</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Your follow-up appointment has been automatically scheduled:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${appointmentTime}</p>
            ${provider ? `<p><strong>Provider:</strong> ${provider.name || `${provider.firstName} ${provider.lastName}`}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode}</p>
            <p><strong>Reason:</strong> Follow-up visit</p>
          </div>
          <p>We'll send you a reminder closer to your appointment date.</p>
          <p>If you need to reschedule or cancel, please contact the clinic.</p>
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

