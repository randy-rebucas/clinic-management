// Recurring Appointment Automation
// Automatically creates recurring appointments

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { combineDateAndTimeInTz, formatInTz } from '@/lib/tz';
import { addDays, addMonths, addYears } from 'date-fns';
import { Types } from 'mongoose';
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

type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringAppointmentConfig {
  patientId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  providerId?: Types.ObjectId;
  frequency: Frequency;
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

const AUTO_NOTE = '[Recurring appointment - created automatically]';

/**
 * Create recurring appointment configuration
 */
export async function createRecurringConfig(_config: RecurringAppointmentConfig): Promise<{
  success: boolean;
  configId?: string;
  error?: string;
}> {
  // Series are tracked through Appointment.recurringParentId; no separate config is stored.
  return { success: true, configId: 'config-' + Date.now() };
}

/**
 * Calculate next appointment date based on frequency
 */
export function calculateNextAppointmentDate(lastAppointmentDate: Date, frequency: Frequency): Date {
  switch (frequency) {
    case 'weekly':
      return addDays(lastAppointmentDate, 7);
    case 'biweekly':
      return addDays(lastAppointmentDate, 14);
    case 'monthly':
      return addMonths(lastAppointmentDate, 1);
    case 'quarterly':
      return addMonths(lastAppointmentDate, 3);
    case 'yearly':
      return addYears(lastAppointmentDate, 1);
  }
}

/** Next occurrence as a clinic-local "yyyy-MM-dd", computed on the calendar date (no TZ drift). */
function nextOccurrenceYmd(lastAppointment: any, frequency: Frequency, tz: string): string | null {
  const ref = lastAppointment.appointmentDate || lastAppointment.scheduledAt;
  if (!ref) return null;
  const ymd = formatInTz(ref, 'yyyy-MM-dd', tz);
  const next = calculateNextAppointmentDate(new Date(`${ymd}T00:00:00.000Z`), frequency);
  return next.toISOString().slice(0, 10);
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

    const tenantId = config.tenantId || lastAppointment.tenantId;
    if (!tenantId) {
      return { success: false, error: 'Tenant is required' };
    }
    const tid = new Types.ObjectId(String(tenantId));

    const settings = await getSettings(tid.toString());
    if (!automationEnabled(settings, 'autoRecurringAppointments')) {
      return { success: true };
    }

    const tz = await getTenantTimezone(tid);
    const ymd = nextOccurrenceYmd(lastAppointment, config.frequency, tz);
    if (!ymd) return { success: true };

    if (config.endDate && new Date(`${ymd}T00:00:00.000Z`) > new Date(config.endDate)) {
      return { success: true }; // Series complete
    }
    if (ymd < formatInTz(new Date(), 'yyyy-MM-dd', tz)) {
      return { success: true }; // Never book into the past
    }

    // Any status counts: a cancelled or no-show occurrence must not be recreated.
    const dayStart = combineDateAndTimeInTz(ymd, '00:00', tz);
    const dayEnd = new Date(combineDateAndTimeInTz(ymd, '23:59', tz).getTime() + 59999);
    const existing = await Appointment.exists({
      tenantId: tid,
      $or: [
        { recurringParentId: lastAppointment._id },
        { patient: config.patientId, recurringOccurrenceDate: ymd },
        { patient: config.patientId, appointmentDate: { $gte: dayStart, $lte: dayEnd } },
      ],
    });
    if (existing) {
      return { success: true };
    }

    const appointmentTime: string | undefined =
      lastAppointment.appointmentTime ||
      (lastAppointment.scheduledAt ? formatInTz(lastAppointment.scheduledAt, 'HH:mm', tz) : undefined);

    const baseNotes = String(config.notes || '').split(AUTO_NOTE).join('').trim();
    const appointmentCode = await nextAppointmentCode(tid);

    const appointment = await Appointment.create({
      tenantId: tid,
      patient: config.patientId,
      doctor: config.doctorId,
      provider: config.providerId,
      appointmentCode,
      appointmentDate: new Date(`${ymd}T00:00:00.000Z`),
      appointmentTime,
      scheduledAt: combineDateAndTimeInTz(ymd, appointmentTime || '09:00', tz),
      status: 'scheduled',
      reason: config.reason || `Recurring appointment (${config.frequency})`,
      notes: `${baseNotes}\n${AUTO_NOTE}`.trim(),
      duration: config.duration || 30,
      recurringParentId: lastAppointment._id,
      recurringOccurrenceDate: ymd,
    });

    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName');

    const patient = appointment.patient as any;
    if (patient && config.sendNotification !== false) {
      const clinicName = settings.clinicName || 'Clinic';
      const dateText = displayDate(appointment.scheduledAt, tz);
      const timeText = displayTime(appointmentTime);

      if (patient.phone) {
        try {
          const message = `Your next recurring appointment has been scheduled for ${dateText}${appointmentTime ? ` at ${timeText}` : ''}. Appointment Code: ${appointmentCode}. - ${clinicName}`;
          await sendSMS({ to: patient.phone, message });
        } catch (error) {
          console.error('Error sending recurring appointment SMS:', error);
        }
      }

      if (patient.email) {
        try {
          const emailContent = generateRecurringAppointmentEmail(appointment, settings, dateText, timeText);
          await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        } catch (error) {
          console.error('Error sending recurring appointment email:', error);
        }
      }
    }

    return { success: true, appointment };
  } catch (error: any) {
    console.error('Error creating next recurring appointment:', error);
    return {
      success: false,
      error: 'Failed to create next recurring appointment',
    };
  }
}

type RecurringResult = {
  success: boolean;
  processed: number;
  created: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; created?: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<RecurringResult> {
  const out: RecurringResult = { success: true, processed: 0, created: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoRecurringAppointments')) return out;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const appointments = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    status: 'completed',
    notes: { $regex: /recurring|recur/i },
    updatedAt: { $gte: sevenDaysAgo },
  })
    .limit(BATCH_LIMIT)
    .lean();

  for (const appointment of appointments as any[]) {
    out.processed++;
    try {
      const frequency = (extractFrequencyFromNotes(appointment.notes || '') || 'monthly') as Frequency;
      const result = await createNextRecurringAppointment(appointment, {
        patientId: appointment.patient,
        doctorId: appointment.doctor,
        providerId: appointment.provider,
        frequency,
        startDate: appointment.appointmentDate || appointment.scheduledAt || new Date(),
        duration: appointment.duration || 30,
        reason: appointment.reason,
        notes: appointment.notes,
        tenantId: tenant.tenantObjectId,
        sendNotification: true,
      });
      out.results.push({
        appointmentId: String(appointment._id),
        success: result.success,
        created: !!result.appointment,
        error: result.error,
      });
      if (result.success && result.appointment) out.created++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ appointmentId: String(appointment._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process completed recurring appointments and create the next ones.
 * Without a tenantId every active tenant is processed.
 */
export async function processRecurringAppointments(tenantId?: string | Types.ObjectId): Promise<RecurringResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: RecurringResult = { success: runs.every((r) => r.success), processed: 0, created: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.created += run.result.created;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing recurring appointments:', error);
    return {
      success: false,
      processed: 0,
      created: 0,
      errors: 1,
      results: [],
    };
  }
}

function extractFrequencyFromNotes(notes: string): string | null {
  const frequencyPatterns = {
    biweekly: /biweekly|bi-weekly|every two weeks|every 2 weeks/i,
    weekly: /weekly|every week|each week/i,
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

function generateRecurringAppointmentEmail(
  appointment: any,
  settings: any,
  dateText: string,
  timeText: string
): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const clinicName = settings.clinicName || 'Clinic';

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
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Recurring Appointment Scheduled</h1>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Your next recurring appointment has been automatically scheduled:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${escapeHtml(dateText)}</p>
            <p><strong>Time:</strong> ${escapeHtml(timeText)}</p>
            ${doctor ? `<p><strong>Doctor:</strong> Dr. ${escapeHtml(doctor.firstName)} ${escapeHtml(doctor.lastName)}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${escapeHtml(appointment.appointmentCode)}</p>
          </div>
          <p>This appointment was automatically created as part of your recurring appointment series.</p>
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
