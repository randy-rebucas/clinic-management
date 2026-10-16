// Follow-up Visit Scheduling Automation
// Automatically schedules follow-up visits

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { dayRangeInTz, formatInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  nextAppointmentCode,
  daysUntilInTz,
  displayDate,
  displayTime,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface FollowupSchedulingOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendNotification?: boolean;
  sendEmail?: boolean;
  sendSMS?: boolean;
}

const DEFAULT_FOLLOWUP_TIME = '09:00';
const OPEN_STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled'];

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

    if (!options.tenantId) {
      return { success: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoFollowupScheduling')) {
      return {
        success: false,
        skipped: true,
        reason: 'Automatic follow-up scheduling is disabled',
      };
    }

    const visit = await Visit.findOne({ _id: options.visitId, tenantId })
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name doctorProfile');

    if (!visit) {
      return { success: false, error: 'Visit not found' };
    }

    if (!visit.followUpDate) {
      return { success: false, skipped: true, reason: 'Visit does not have a follow-up date' };
    }

    if (visit.status !== 'closed') {
      return { success: false, skipped: true, reason: 'Visit is not closed' };
    }

    if (visit.followUpAppointmentId) {
      return { success: false, skipped: true, reason: 'Follow-up appointment already scheduled' };
    }

    const tz = await getTenantTimezone(tenantId);
    if (daysUntilInTz(visit.followUpDate, tz) < 0) {
      return { success: false, skipped: true, reason: 'Follow-up date is in the past' };
    }

    const patient = visit.patient as any;
    const provider = visit.provider as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    // An appointment already booked for that clinic-local day counts as the follow-up.
    const { start, end } = dayRangeInTz(new Date(visit.followUpDate), tz);
    const existingAppointment = await Appointment.findOne({
      tenantId,
      patient: patient._id,
      appointmentDate: { $gte: start, $lte: end },
      status: { $in: OPEN_STATUSES },
    }).select('_id');

    if (existingAppointment) {
      await Visit.updateOne(
        { _id: visit._id, tenantId, followUpAppointmentId: { $exists: false } },
        { $set: { followUpAppointmentId: existingAppointment._id } }
      );
      return {
        success: false,
        skipped: true,
        reason: 'Appointment already exists for follow-up date',
        appointment: existingAppointment,
      };
    }

    // Claim the visit first so a concurrent run can't create a second appointment.
    const appointmentId = new Types.ObjectId();
    const claim = await Visit.updateOne(
      { _id: visit._id, tenantId, followUpAppointmentId: { $exists: false } },
      { $set: { followUpAppointmentId: appointmentId } }
    );
    if (claim.modifiedCount === 0) {
      return { success: false, skipped: true, reason: 'Follow-up appointment already scheduled' };
    }

    let appointment;
    try {
      const ymd = formatInTz(visit.followUpDate, 'yyyy-MM-dd', tz);
      const appointmentCode = await nextAppointmentCode(tenantId);
      appointment = await Appointment.create({
        _id: appointmentId,
        tenantId,
        patient: patient._id,
        doctor: provider?.doctorProfile || undefined,
        provider: provider?._id,
        appointmentCode,
        appointmentDate: new Date(`${ymd}T00:00:00.000Z`),
        appointmentTime: DEFAULT_FOLLOWUP_TIME,
        status: 'scheduled',
        reason: 'Follow-up visit',
        notes: `Follow-up appointment for visit ${visit.visitCode || visit._id}`,
        duration: 30,
      });
    } catch (error) {
      await Visit.updateOne({ _id: visit._id, tenantId, followUpAppointmentId: appointmentId }, { $unset: { followUpAppointmentId: 1 } });
      throw error;
    }

    const dateText = displayDate(visit.followUpDate, tz);
    const timeText = displayTime(DEFAULT_FOLLOWUP_TIME);

    // Patients have no User account, so no in-app notification is created here.
    if (options.sendEmail && patient.email) {
      try {
        const emailContent = generateFollowupEmail(patient, provider, appointment, dateText, timeText);
        await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
      } catch (error) {
        console.error('Error sending follow-up appointment email:', error);
      }
    }

    if (options.sendSMS && patient.phone) {
      try {
        const message = `Your follow-up appointment has been scheduled for ${dateText} at ${timeText}. Appointment Code: ${appointment.appointmentCode}. We'll send a reminder closer to the date.`;
        await sendSMS({ to: patient.phone, message });
      } catch (error) {
        console.error('Error sending follow-up appointment SMS:', error);
      }
    }

    return { success: true, appointment };
  } catch (error: any) {
    console.error('Error scheduling follow-up appointment:', error);
    return {
      success: false,
      error: 'Failed to schedule follow-up appointment',
    };
  }
}

type FollowupResult = {
  success: boolean;
  processed: number;
  scheduled: number;
  errors: number;
  results: Array<{ visitId: string; success: boolean; error?: string; appointmentId?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<FollowupResult> {
  const out: FollowupResult = { success: true, processed: 0, scheduled: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoFollowupScheduling')) return out;

  const { start: todayStart } = dayRangeInTz(new Date(), tenant.timezone);

  const visits = await Visit.find({
    tenantId: tenant.tenantObjectId,
    status: 'closed',
    followUpDate: { $gte: todayStart },
    followUpAppointmentId: { $exists: false },
  })
    .select('_id')
    .sort({ followUpDate: 1 })
    .limit(BATCH_LIMIT)
    .lean();

  for (const visit of visits as any[]) {
    out.processed++;
    try {
      const result = await scheduleFollowupAppointment({
        visitId: visit._id,
        tenantId: tenant.tenantObjectId,
        sendNotification: true,
        sendEmail: true,
        sendSMS: true,
      });
      out.results.push({
        visitId: String(visit._id),
        success: result.success,
        error: result.error,
        appointmentId: result.appointment?._id?.toString(),
      });
      if (result.success && result.appointment) out.scheduled++;
      else if (!result.success && !result.skipped) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ visitId: String(visit._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process visits with upcoming follow-up dates and schedule appointments.
 * Without a tenantId every active tenant is processed.
 */
export async function processFollowupScheduling(tenantId?: string | Types.ObjectId): Promise<FollowupResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: FollowupResult = { success: runs.every((r) => r.success), processed: 0, scheduled: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.scheduled += run.result.scheduled;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing follow-up scheduling:', error);
    return {
      success: false,
      processed: 0,
      scheduled: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateFollowupEmail(
  patient: any,
  provider: any,
  appointment: any,
  dateText: string,
  timeText: string
): { subject: string; html: string } {
  const subject = `Follow-up Appointment Scheduled - ${dateText}`;

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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Your follow-up appointment has been automatically scheduled:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${escapeHtml(dateText)}</p>
            <p><strong>Time:</strong> ${escapeHtml(timeText)}</p>
            ${provider?.name ? `<p><strong>Provider:</strong> ${escapeHtml(provider.name)}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${escapeHtml(appointment.appointmentCode)}</p>
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
