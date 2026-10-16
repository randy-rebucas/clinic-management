// Waitlist Management Automation
// Automatically fills cancelled appointment slots from waitlist

import mongoose, { Schema, Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { buildAppointmentActionUrl } from '@/lib/appointment-links';
import { combineDateAndTimeInTz, formatInTz } from '@/lib/tz';
import {
  forEachTenant,
  automationEnabled,
  getTenantTimezone,
  nextAppointmentCode,
  displayDate,
  displayTime,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface WaitlistEntry {
  patientId: Types.ObjectId;
  preferredDate?: Date;
  preferredTime?: string;
  doctorId?: Types.ObjectId;
  priority?: number; // Higher number = higher priority
  createdAt: Date;
}

// Persisted waitlist (an in-memory list was lost between serverless invocations).
const WaitlistEntrySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    preferredDate: { type: Date },
    preferredTime: { type: String, trim: true },
    priority: { type: Number, default: 0 },
    status: { type: String, enum: ['waiting', 'filled', 'removed'], default: 'waiting', index: true },
    filledAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    filledAt: { type: Date },
  },
  { timestamps: true }
);
WaitlistEntrySchema.index({ tenantId: 1, status: 1, priority: -1, createdAt: 1 });
WaitlistEntrySchema.index(
  { tenantId: 1, patient: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' }, name: 'uniq_waiting_patient' }
);

const WaitlistEntryModel =
  (mongoose.models.WaitlistEntry as mongoose.Model<any>) || mongoose.model('WaitlistEntry', WaitlistEntrySchema);

function toObjectId(id: string | Types.ObjectId | undefined | null): Types.ObjectId | undefined {
  if (!id || !Types.ObjectId.isValid(String(id))) return undefined;
  return new Types.ObjectId(String(id));
}

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

    const tenantId = toObjectId(options.tenantId);
    const patientIdObj = toObjectId(patientId);
    if (!tenantId) {
      return { success: false, added: false, error: 'Tenant is required' };
    }
    if (!patientIdObj) {
      return { success: false, added: false, error: 'Patient not found' };
    }

    const patient = await Patient.findOne({ _id: patientIdObj, tenantIds: tenantId }).select('_id');
    if (!patient) {
      return { success: false, added: false, error: 'Patient not found' };
    }

    if (options.doctorId && !toObjectId(options.doctorId)) {
      return { success: false, added: false, error: 'Invalid doctor' };
    }
    const preferredDate =
      options.preferredDate && !isNaN(new Date(options.preferredDate).getTime()) ? new Date(options.preferredDate) : undefined;
    const preferredTime =
      typeof options.preferredTime === 'string' && /^\d{1,2}:\d{2}$/.test(options.preferredTime) ? options.preferredTime : undefined;
    const priority = Number.isFinite(Number(options.priority)) ? Math.max(0, Math.min(100, Number(options.priority))) : 0;

    await WaitlistEntryModel.findOneAndUpdate(
      { tenantId, patient: patientIdObj, status: 'waiting' },
      {
        $set: {
          doctor: toObjectId(options.doctorId),
          preferredDate,
          preferredTime,
          priority,
        },
        $setOnInsert: { tenantId, patient: patientIdObj, status: 'waiting' },
      },
      { upsert: true, new: true }
    );

    return { success: true, added: true };
  } catch (error: any) {
    console.error('Error adding to waitlist:', error);
    return {
      success: false,
      added: false,
      error: 'Failed to add to waitlist',
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
    await connectDB();

    const tenantIdObj = toObjectId(tenantId);
    const patientIdObj = toObjectId(patientId);
    if (!tenantIdObj || !patientIdObj) {
      return { success: true, removed: false };
    }

    const res = await WaitlistEntryModel.updateMany(
      { tenantId: tenantIdObj, patient: patientIdObj, status: 'waiting' },
      { $set: { status: 'removed' } }
    );

    return { success: true, removed: (res.modifiedCount ?? 0) > 0 };
  } catch (error: any) {
    console.error('Error removing from waitlist:', error);
    return {
      success: false,
      removed: false,
      error: 'Failed to remove from waitlist',
    };
  }
}

/**
 * Atomically claim the best waiting entry for a freed slot.
 */
async function claimMatchingWaitlistEntry(
  cancelledAppointment: any,
  tenantId: Types.ObjectId,
  slotStart: Date
): Promise<any | null> {
  const doctorId = cancelledAppointment.doctor ? String(cancelledAppointment.doctor) : null;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const candidates = await WaitlistEntryModel.find({
    tenantId,
    status: 'waiting',
    patient: { $ne: cancelledAppointment.patient },
  })
    .sort({ priority: -1, createdAt: 1 })
    .limit(50)
    .lean();

  for (const entry of candidates as any[]) {
    if (entry.doctor && doctorId && String(entry.doctor) !== doctorId) continue;
    if (entry.preferredDate && Math.abs(slotStart.getTime() - new Date(entry.preferredDate).getTime()) > sevenDays) continue;

    const claimed = await WaitlistEntryModel.findOneAndUpdate(
      { _id: entry._id, status: 'waiting' },
      { $set: { status: 'filled', filledAt: new Date() } },
      { new: true }
    ).lean();
    if (claimed) return claimed;
  }

  return null;
}

/**
 * Fill cancelled appointment slot from waitlist. Each cancelled appointment is processed once.
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

    const appointmentIdObj = toObjectId(appointmentId);
    if (!appointmentIdObj) {
      return { success: false, filled: false, error: 'Appointment not found' };
    }

    const filter: Record<string, unknown> = { _id: appointmentIdObj };
    const requestedTenant = toObjectId(tenantId);
    if (requestedTenant) filter.tenantId = requestedTenant;
    const appointment = await Appointment.findOne(filter);
    if (!appointment || !appointment.tenantId) {
      return { success: false, filled: false, error: 'Appointment not found' };
    }
    const tenantIdObj = new Types.ObjectId(String(appointment.tenantId));

    const settings = await getSettings(tenantIdObj.toString());
    if (!automationEnabled(settings, 'autoWaitlistManagement')) {
      return { success: true, filled: false };
    }

    if (appointment.status !== 'cancelled') {
      return { success: true, filled: false };
    }

    // Claim the cancellation so repeated cron runs / the API trigger can't fill it twice.
    const claim = await Appointment.updateOne(
      { _id: appointment._id, tenantId: tenantIdObj, status: 'cancelled', waitlistProcessedAt: { $exists: false } },
      { $set: { waitlistProcessedAt: new Date() } }
    );
    if (claim.modifiedCount === 0) {
      return { success: true, filled: false };
    }

    const tz = await getTenantTimezone(tenantIdObj);
    const appointmentTime =
      appointment.appointmentTime ||
      (appointment.scheduledAt ? formatInTz(appointment.scheduledAt, 'HH:mm', tz) : undefined);
    const dayRef = appointment.appointmentDate || appointment.scheduledAt;
    if (!dayRef || !appointmentTime) {
      return { success: true, filled: false };
    }
    const ymd = formatInTz(dayRef, 'yyyy-MM-dd', tz);
    const slotStart = appointment.scheduledAt ? new Date(appointment.scheduledAt) : combineDateAndTimeInTz(ymd, appointmentTime, tz);

    // Never offer a slot that has already started or is about to.
    if (slotStart.getTime() < Date.now() + 60 * 60 * 1000) {
      return { success: true, filled: false };
    }

    const entry = await claimMatchingWaitlistEntry(appointment, tenantIdObj, slotStart);
    if (!entry) {
      return { success: true, filled: false };
    }

    const patient = await Patient.findOne({ _id: entry.patient, tenantIds: tenantIdObj }).select('firstName lastName email phone');
    if (!patient) {
      await WaitlistEntryModel.updateOne({ _id: entry._id }, { $set: { status: 'removed' } });
      return { success: false, filled: false, error: 'Waitlist patient not found' };
    }

    let newAppointment;
    try {
      const appointmentCode = await nextAppointmentCode(tenantIdObj);
      newAppointment = await Appointment.create({
        tenantId: tenantIdObj,
        patient: patient._id,
        doctor: appointment.doctor,
        provider: appointment.provider,
        appointmentCode,
        appointmentDate: new Date(`${ymd}T00:00:00.000Z`),
        appointmentTime,
        scheduledAt: slotStart,
        status: 'scheduled',
        reason: 'Waitlist fill',
        notes: `Appointment filled from waitlist (replacing cancelled appointment ${appointment.appointmentCode || appointment._id})`,
        duration: appointment.duration || 30,
      });
    } catch (error) {
      // Put the patient back on the list if the booking couldn't be made.
      await WaitlistEntryModel.updateOne({ _id: entry._id, status: 'filled' }, { $set: { status: 'waiting' }, $unset: { filledAt: 1 } });
      throw error;
    }

    await Promise.all([
      WaitlistEntryModel.updateOne({ _id: entry._id }, { $set: { filledAppointmentId: newAppointment._id } }),
      Appointment.updateOne({ _id: appointment._id, tenantId: tenantIdObj }, { $set: { waitlistFilledBy: newAppointment._id } }),
    ]);

    const dateText = displayDate(slotStart, tz);
    const timeText = displayTime(appointmentTime);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const confirmUrl = buildAppointmentActionUrl(baseUrl, newAppointment._id.toString(), 'yes');

    // Patients have no User account, so no in-app notification is created here.
    if (patient.phone) {
      try {
        const message = `Great news! An appointment slot has become available. Your appointment is scheduled for ${dateText} at ${timeText}. Appointment Code: ${newAppointment.appointmentCode}. Confirm: ${confirmUrl}`;
        await sendSMS({ to: patient.phone, message });
      } catch (error) {
        console.error('Error sending waitlist fill SMS:', error);
      }
    }

    if (patient.email) {
      try {
        const emailContent = generateWaitlistFillEmail(patient, newAppointment, dateText, timeText, confirmUrl);
        await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
      } catch (error) {
        console.error('Error sending waitlist fill email:', error);
      }
    }

    return { success: true, filled: true, newAppointment };
  } catch (error: any) {
    console.error('Error filling cancelled slot:', error);
    return {
      success: false,
      filled: false,
      error: 'Failed to fill cancelled slot',
    };
  }
}

type WaitlistResult = {
  success: boolean;
  processed: number;
  filled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; filled: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<WaitlistResult> {
  const out: WaitlistResult = { success: true, processed: 0, filled: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoWaitlistManagement')) return out;

  const hasWaiting = await WaitlistEntryModel.exists({ tenantId: tenant.tenantObjectId, status: 'waiting' });
  if (!hasWaiting) return out;

  // Cancellations from the last day that haven't been offered yet (missed runs catch up).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cancelled = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    status: 'cancelled',
    updatedAt: { $gte: since },
    waitlistProcessedAt: { $exists: false },
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();

  for (const appointment of cancelled as any[]) {
    out.processed++;
    try {
      const result = await fillCancelledSlot(appointment._id, tenant.tenantObjectId);
      out.results.push({ appointmentId: String(appointment._id), success: result.success, filled: result.filled, error: result.error });
      if (result.success && result.filled) out.filled++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ appointmentId: String(appointment._id), success: false, filled: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process cancelled appointments and fill from waitlist.
 * Without a tenantId every active tenant is processed.
 */
export async function processWaitlistFills(tenantId?: string | Types.ObjectId): Promise<WaitlistResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: WaitlistResult = { success: runs.every((r) => r.success), processed: 0, filled: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.filled += run.result.filled;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing waitlist fills:', error);
    return {
      success: false,
      processed: 0,
      filled: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateWaitlistFillEmail(
  patient: any,
  appointment: any,
  dateText: string,
  timeText: string,
  confirmUrl: string
): { subject: string; html: string } {
  const subject = `Appointment Available - ${dateText}`;

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
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p><strong>Great news!</strong> An appointment slot has become available and we've scheduled it for you:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${escapeHtml(dateText)}</p>
            <p><strong>Time:</strong> ${escapeHtml(timeText)}</p>
            <p><strong>Appointment Code:</strong> ${escapeHtml(appointment.appointmentCode)}</p>
          </div>
          <p>Please confirm this appointment by clicking the button below.</p>
          <p style="text-align: center;">
            <a href="${escapeHtml(confirmUrl)}" class="button">Confirm Appointment</a>
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
