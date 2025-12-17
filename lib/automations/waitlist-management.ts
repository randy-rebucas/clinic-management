// Waitlist Management Automation
// Automatically fills cancelled appointment slots from waitlist

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface WaitlistEntry {
  patientId: Types.ObjectId;
  preferredDate?: Date;
  preferredTime?: string;
  doctorId?: Types.ObjectId;
  priority?: number; // Higher number = higher priority
  createdAt: Date;
}

// In-memory waitlist (in production, consider using Redis or database)
const waitlist: Map<string, WaitlistEntry[]> = new Map();

/**
 * Add patient to waitlist
 */
export async function addToWaitlist(
  patientId: string | Types.ObjectId,
  options: {
    tenantId?: string | Types.ObjectId;
    doctorId?: string | Types.ObjectId;
    preferredDate?: Date;
    preferredTime?: string;
    priority?: number;
  } = {}
): Promise<{
  success: boolean;
  added: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const patientIdObj = typeof patientId === 'string' 
      ? new Types.ObjectId(patientId) 
      : patientId;

    const patient = await Patient.findById(patientIdObj);
    if (!patient) {
      return { success: false, added: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : patient.tenantId;

    const waitlistKey = tenantId ? tenantId.toString() : 'default';
    
    if (!waitlist.has(waitlistKey)) {
      waitlist.set(waitlistKey, []);
    }

    const entries = waitlist.get(waitlistKey)!;
    
    // Check if patient is already on waitlist
    const existingIndex = entries.findIndex(
      entry => entry.patientId.toString() === patientIdObj.toString()
    );

    const entry: WaitlistEntry = {
      patientId: patientIdObj,
      preferredDate: options.preferredDate,
      preferredTime: options.preferredTime,
      doctorId: options.doctorId 
        ? (typeof options.doctorId === 'string' ? new Types.ObjectId(options.doctorId) : options.doctorId)
        : undefined,
      priority: options.priority || 0,
      createdAt: new Date(),
    };

    if (existingIndex >= 0) {
      // Update existing entry
      entries[existingIndex] = entry;
    } else {
      // Add new entry
      entries.push(entry);
    }

    // Sort by priority (descending) and creation date (ascending)
    entries.sort((a, b) => {
      if (b.priority !== a.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return { success: true, added: true };
  } catch (error: any) {
    console.error('Error adding to waitlist:', error);
    return { 
      success: false, 
      added: false,
      error: error.message || 'Failed to add to waitlist' 
    };
  }
}

/**
 * Remove patient from waitlist
 */
export async function removeFromWaitlist(
  patientId: string | Types.ObjectId,
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  removed: boolean;
  error?: string;
}> {
  try {
    const patientIdObj = typeof patientId === 'string' 
      ? new Types.ObjectId(patientId) 
      : patientId;

    const tenantIdObj = tenantId 
      ? (typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId)
      : undefined;

    const waitlistKey = tenantIdObj ? tenantIdObj.toString() : 'default';
    
    if (!waitlist.has(waitlistKey)) {
      return { success: true, removed: false };
    }

    const entries = waitlist.get(waitlistKey)!;
    const index = entries.findIndex(
      entry => entry.patientId.toString() === patientIdObj.toString()
    );

    if (index >= 0) {
      entries.splice(index, 1);
      return { success: true, removed: true };
    }

    return { success: true, removed: false };
  } catch (error: any) {
    console.error('Error removing from waitlist:', error);
    return { 
      success: false, 
      removed: false,
      error: error.message || 'Failed to remove from waitlist' 
    };
  }
}

/**
 * Find matching waitlist entry for cancelled appointment
 */
async function findMatchingWaitlistEntry(
  cancelledAppointment: any,
  tenantId?: Types.ObjectId
): Promise<WaitlistEntry | null> {
  const waitlistKey = tenantId ? tenantId.toString() : 'default';
  
  if (!waitlist.has(waitlistKey)) {
    return null;
  }

  const entries = waitlist.get(waitlistKey)!;
  const appointmentDate = cancelledAppointment.appointmentDate 
    ? new Date(cancelledAppointment.appointmentDate)
    : cancelledAppointment.scheduledAt 
    ? new Date(cancelledAppointment.scheduledAt)
    : null;

  // Find best matching entry
  for (const entry of entries) {
    // Check doctor match
    if (cancelledAppointment.doctor || cancelledAppointment.provider) {
      const appointmentDoctorId = cancelledAppointment.doctor?._id || cancelledAppointment.provider?._id;
      if (entry.doctorId && entry.doctorId.toString() !== appointmentDoctorId?.toString()) {
        continue;
      }
    }

    // Check date match (within 7 days)
    if (appointmentDate && entry.preferredDate) {
      const daysDiff = Math.abs(
        (appointmentDate.getTime() - new Date(entry.preferredDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 7) {
        continue;
      }
    }

    // Found a match
    return entry;
  }

  return null;
}

/**
 * Fill cancelled appointment slot from waitlist
 */
export async function fillCancelledSlot(
  appointmentId: string | Types.ObjectId,
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  filled: boolean;
  newAppointment?: any;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoWaitlistManagement = (settings.automationSettings as any)?.autoWaitlistManagement !== false;

    if (!autoWaitlistManagement) {
      return { success: true, filled: false };
    }

    const appointmentIdObj = typeof appointmentId === 'string' 
      ? new Types.ObjectId(appointmentId) 
      : appointmentId;

    const appointment = await Appointment.findById(appointmentIdObj)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    // Only fill if appointment is cancelled
    if (appointment.status !== 'cancelled') {
      return { success: true, filled: false };
    }

    const tenantIdObj = tenantId 
      ? (typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId)
      : appointment.tenantId;

    // Find matching waitlist entry
    const waitlistEntry = await findMatchingWaitlistEntry(appointment, tenantIdObj);

    if (!waitlistEntry) {
      return { success: true, filled: false };
    }

    // Get patient
    const patient = await Patient.findById(waitlistEntry.patientId);
    if (!patient) {
      return { success: false, error: 'Waitlist patient not found' };
    }

    // Create new appointment with same slot
    const appointmentDate = appointment.appointmentDate 
      ? new Date(appointment.appointmentDate)
      : appointment.scheduledAt 
      ? new Date(appointment.scheduledAt)
      : new Date();

    const appointmentTime = appointment.appointmentTime 
      || (appointment.scheduledAt 
        ? `${appointment.scheduledAt.getHours().toString().padStart(2, '0')}:${appointment.scheduledAt.getMinutes().toString().padStart(2, '0')}`
        : waitlistEntry.preferredTime || '09:00');

    // Generate appointment code
    const codeQuery: any = { appointmentCode: { $exists: true, $ne: null } };
    if (tenantIdObj) {
      codeQuery.tenantId = tenantIdObj;
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

    // Create new appointment
    const newAppointmentData: any = {
      tenantId: tenantIdObj,
      patient: patient._id,
      doctor: appointment.doctor || appointment.provider,
      provider: appointment.provider || appointment.doctor,
      appointmentCode,
      appointmentDate,
      appointmentTime,
      scheduledAt: appointment.scheduledAt || appointmentDate,
      status: 'scheduled',
      reason: 'Waitlist fill',
      notes: `Appointment filled from waitlist (replacing cancelled appointment ${appointment.appointmentCode})`,
      duration: appointment.duration || 30,
    };

    const newAppointment = await Appointment.create(newAppointmentData);

    // Populate new appointment
    await newAppointment.populate('patient', 'firstName lastName email phone');
    await newAppointment.populate('doctor', 'firstName lastName');

    // Remove from waitlist
    await removeFromWaitlist(patient._id, tenantIdObj);

    // Notify patient
    const patientObj = newAppointment.patient as any;
    if (patientObj) {
      // Send SMS
      if (patientObj.phone) {
        try {
          let phoneNumber = patientObj.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const message = `Great news! An appointment slot has become available. Your appointment is scheduled for ${appointmentDate.toLocaleDateString()} at ${appointmentTime}. Appointment Code: ${appointmentCode}. Please confirm by replying YES.`;

          await sendSMS({
            to: phoneNumber,
            message,
          });
        } catch (error) {
          console.error('Error sending waitlist fill SMS:', error);
        }
      }

      // Send email
      if (patientObj.email) {
        try {
          const emailContent = generateWaitlistFillEmail(newAppointment);
          await sendEmail({
            to: patientObj.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        } catch (error) {
          console.error('Error sending waitlist fill email:', error);
        }
      }

      // Send notification
      try {
        await createNotification({
          userId: patient._id,
          tenantId: tenantIdObj,
          type: 'appointment',
          priority: 'high',
          title: 'Appointment Available from Waitlist',
          message: `An appointment slot has become available. Your appointment is scheduled for ${appointmentDate.toLocaleDateString()} at ${appointmentTime}.`,
          relatedEntity: {
            type: 'appointment',
            id: newAppointment._id,
          },
          actionUrl: `/appointments/${newAppointment._id}`,
        });
      } catch (error) {
        console.error('Error creating waitlist fill notification:', error);
      }
    }

    return { success: true, filled: true, newAppointment };
  } catch (error: any) {
    console.error('Error filling cancelled slot:', error);
    return { 
      success: false, 
      filled: false,
      error: error.message || 'Failed to fill cancelled slot' 
    };
  }
}

/**
 * Process cancelled appointments and fill from waitlist
 * This should be called by a cron job or when appointment is cancelled
 */
export async function processWaitlistFills(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  filled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; filled: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoWaitlistManagement = (settings.automationSettings as any)?.autoWaitlistManagement !== false;

    if (!autoWaitlistManagement) {
      return { success: true, processed: 0, filled: 0, errors: 0, results: [] };
    }

    // Find recently cancelled appointments (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const query: any = {
      status: 'cancelled',
      updatedAt: { $gte: oneHourAgo },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    const cancelledAppointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');

    const results: Array<{ appointmentId: string; success: boolean; filled: boolean; error?: string }> = [];
    let filled = 0;
    let errors = 0;

    for (const appointment of cancelledAppointments) {
      const result = await fillCancelledSlot(appointment._id, appointment.tenantId);

      results.push({
        appointmentId: appointment._id.toString(),
        success: result.success,
        filled: result.filled,
        error: result.error,
      });

      if (result.success && result.filled) {
        filled++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: cancelledAppointments.length,
      filled,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing waitlist fills:', error);
    return {
      success: false,
      processed: 0,
      filled: 0,
      errors: 1,
      results: [{ appointmentId: 'unknown', success: false, filled: false, error: error.message }],
    };
  }
}

/**
 * Generate waitlist fill email
 */
function generateWaitlistFillEmail(appointment: any): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate || appointment.scheduledAt).toLocaleDateString();
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const confirmUrl = `${baseUrl}/api/appointments/${appointment._id}/confirm?action=yes`;

  const subject = `Appointment Available - ${appointmentDate}`;

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
          <h1>Appointment Available!</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p><strong>Great news!</strong> An appointment slot has become available and we've scheduled it for you:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate}</p>
            <p><strong>Time:</strong> ${appointmentTime}</p>
            ${doctor ? `<p><strong>Doctor:</strong> Dr. ${doctor.firstName} ${doctor.lastName}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode}</p>
          </div>
          <p>Please confirm this appointment by clicking the button below or replying to this email.</p>
          <p style="text-align: center;">
            <a href="${confirmUrl}" class="button">Confirm Appointment</a>
          </p>
          <p>If this time doesn't work for you, please contact us to reschedule.</p>
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

