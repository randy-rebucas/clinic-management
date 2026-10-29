// No-Show Handling Automation
// Automatically handles appointments marked as no-show

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Queue from '@/models/Queue';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { combineDateAndTimeInTz, dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  displayDate,
  displayTime,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface NoShowHandlingOptions {
  appointmentId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  autoReschedule?: boolean;
  sendNotification?: boolean;
  sendEmail?: boolean;
  sendSMS?: boolean;
}

/** Minutes after the start time before an unattended appointment counts as a no-show. */
const GRACE_MINUTES = 60;

/**
 * Handle no-show appointment (sends the patient a rescheduling offer)
 */
export async function handleNoShow(options: NoShowHandlingOptions): Promise<{
  success: boolean;
  handled: boolean;
  rescheduled?: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, handled: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoNoShowHandling')) {
      return { success: true, handled: false };
    }

    const appointment = await Appointment.findOne({ _id: options.appointmentId, tenantId })
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return { success: false, handled: false, error: 'Appointment not found' };
    }

    if (appointment.status !== 'no-show') {
      return { success: true, handled: false };
    }

    const patient = appointment.patient as any;
    if (!patient) {
      return { success: false, handled: false, error: 'Patient not found' };
    }

    const tz = await getTenantTimezone(tenantId);
    const message = generateNoShowMessage(appointment, tz);
    const emailContent = generateNoShowEmail(appointment, settings, tz);

    // Patients have no User account, so no in-app notification is created here.
    if (options.sendSMS !== false && patient.phone) {
      try {
        await sendSMS({ to: patient.phone, message });
      } catch (error) {
        console.error('Error sending no-show SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
      } catch (error) {
        console.error('Error sending no-show email:', error);
      }
    }

    return { success: true, handled: true, rescheduled: false };
  } catch (error: any) {
    console.error('Error handling no-show:', error);
    return {
      success: false,
      handled: false,
      error: 'Failed to handle no-show',
    };
  }
}

type NoShowResult = {
  success: boolean;
  processed: number;
  handled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<NoShowResult> {
  const out: NoShowResult = { success: true, processed: 0, handled: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoNoShowHandling')) return out;

  const now = new Date();
  const tz = tenant.timezone;
  // Only yesterday and today: older open appointments are left to end-of-day cleanup,
  // so patients are never messaged about long-past appointments.
  const windowStart = dayRangeOffsetInTz(-1, now, tz).start;

  const appointments = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    status: { $in: ['scheduled', 'confirmed'] },
    $or: [
      { scheduledAt: { $gte: windowStart, $lt: now } },
      { appointmentDate: { $gte: windowStart, $lt: now }, appointmentTime: { $exists: true, $ne: '' } },
    ],
  })
    .select('_id patient scheduledAt appointmentDate appointmentTime duration')
    .limit(BATCH_LIMIT);

  for (const appointment of appointments) {
    try {
      const startsAt: Date = appointment.scheduledAt
        ? new Date(appointment.scheduledAt)
        : combineDateAndTimeInTz(appointment.appointmentDate!, appointment.appointmentTime, tz);
      const graceMs = Math.max(GRACE_MINUTES, appointment.duration || 0) * 60 * 1000;
      if (startsAt.getTime() + graceMs > now.getTime()) {
        continue;
      }
      out.processed++;

      // A patient who checked in or was seen is not a no-show, even if staff never updated the appointment.
      const { start, end } = dayRangeInTz(startsAt, tz);
      const [inQueue, visit] = await Promise.all([
        Queue.exists({
          tenantId: tenant.tenantObjectId,
          status: { $nin: ['cancelled', 'no-show'] },
          $or: [{ appointment: appointment._id }, { patient: appointment.patient, queuedAt: { $gte: start, $lte: end } }],
        }),
        Visit.exists({ tenantId: tenant.tenantObjectId, patient: appointment.patient, date: { $gte: start, $lte: end } }),
      ]);
      if (inQueue || visit) continue;

      const marked = await Appointment.updateOne(
        { _id: appointment._id, tenantId: tenant.tenantObjectId, status: { $in: ['scheduled', 'confirmed'] } },
        { $set: { status: 'no-show' } }
      );
      if (marked.modifiedCount === 0) continue;

      const result = await handleNoShow({
        appointmentId: appointment._id,
        tenantId: tenant.tenantObjectId,
        autoReschedule: false,
        sendEmail: true,
        sendSMS: true,
      });

      out.results.push({ appointmentId: String(appointment._id), success: result.success, error: result.error });
      if (result.success && result.handled) out.handled++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ appointmentId: String(appointment._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Mark unattended appointments as no-show and notify the patients.
 * Without a tenantId every active tenant is processed.
 */
export async function processNoShows(tenantId?: string | Types.ObjectId): Promise<NoShowResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoNoShowHandling' });
    const total: NoShowResult = { success: runs.every((r) => r.success), processed: 0, handled: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.handled += run.result.handled;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing no-shows:', error);
    return {
      success: false,
      processed: 0,
      handled: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateNoShowMessage(appointment: any, tz: string): string {
  const doctor = appointment.doctor as any;
  const appointmentDate = displayDate(appointment.appointmentDate || appointment.scheduledAt, tz);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const rescheduleUrl = `${baseUrl}/book?reschedule=${appointment._id}`;

  return `We noticed you missed your appointment on ${appointmentDate}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. We understand things come up. Would you like to reschedule? Visit ${rescheduleUrl} or contact the clinic.`;
}

function generateNoShowEmail(appointment: any, settings: any, tz: string): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = displayDate(appointment.appointmentDate || appointment.scheduledAt, tz);
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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>We noticed you missed your appointment scheduled for ${escapeHtml(appointmentDate)}${doctor ? ` with Dr. ${escapeHtml(doctor.firstName)} ${escapeHtml(doctor.lastName)}` : ''}.</p>
          <p>We understand that things come up, and we're here to help you reschedule.</p>
          <div class="info-box">
            <p><strong>Original Appointment:</strong></p>
            <p>Date: ${escapeHtml(appointmentDate)}</p>
            <p>Time: ${escapeHtml(displayTime(appointment.appointmentTime))}</p>
            ${appointment.appointmentCode ? `<p>Appointment Code: ${escapeHtml(appointment.appointmentCode)}</p>` : ''}
          </div>
          <p style="text-align: center;">
            <a href="${escapeHtml(rescheduleUrl)}" class="button">Reschedule Appointment</a>
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
