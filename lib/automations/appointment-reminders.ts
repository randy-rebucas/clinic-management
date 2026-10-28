// Day-before appointment and follow-up visit reminders (used by /api/cron/reminders)

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendSMS } from '@/lib/sms';
import { buildAppointmentActionUrl } from '@/lib/appointment-links';
import { dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, delivered, displayDate, displayTime, errorMessage, claimForSend, releaseClaim, BATCH_LIMIT, type AutomationTenant } from './shared';

type ReminderRow = { id: string; code?: string; success: boolean; sid?: string; error?: string };

/**
 * SMS reminders for tomorrow's (clinic-local) appointments. Each appointment is claimed before
 * its SMS goes out and marked with `reminderSentAt` after, so reruns and overlapping runs don't
 * resend; a failed send gives the claim back and is retried on the next run that day.
 */
async function sendTenantAppointmentReminders(tenant: AutomationTenant): Promise<ReminderRow[]> {
  const settings = await getSettings(tenant.tenantId);
  if (settings?.communicationSettings?.appointmentReminders === false) return [];

  const { start, end } = dayRangeOffsetInTz(1, new Date(), tenant.timezone);
  const appointments = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
    reminderSentAt: { $exists: false },
    $or: [{ appointmentDate: { $gte: start, $lte: end } }, { scheduledAt: { $gte: start, $lte: end } }],
  })
    .populate('patient', 'firstName lastName phone')
    .populate('doctor', 'firstName lastName')
    .limit(BATCH_LIMIT);

  const clinicName = settings?.clinicName || tenant.name || 'the clinic';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const results: ReminderRow[] = [];

  for (const appointment of appointments) {
    const id = String(appointment._id);
    try {
      const patient = appointment.patient as any;
      if (!patient?.phone) continue;

      const doctor = appointment.doctor as any;
      const dateText = displayDate(appointment.appointmentDate || appointment.scheduledAt, tenant.timezone);
      const timeText = displayTime(appointment.appointmentTime);
      let message =
        `Reminder from ${clinicName}: you have an appointment with ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'your doctor'} ` +
        `tomorrow (${dateText}) at ${timeText}.` +
        (appointment.appointmentCode ? ` Code: ${appointment.appointmentCode}.` : '') +
        ' Please arrive 10 minutes early.';
      if (appointment.status !== 'confirmed') {
        message += ` Confirm: ${buildAppointmentActionUrl(baseUrl, id, 'yes')}`;
      }

      const own = { _id: appointment._id, tenantId: tenant.tenantObjectId };
      if (!(await claimForSend(Appointment, { ...own, reminderSentAt: { $exists: false } }, 'reminderClaimedAt'))) continue;
      const smsResult = await sendSMS({ to: patient.phone, message }).catch(async (error) => {
        await releaseClaim(Appointment, own, 'reminderClaimedAt');
        throw error;
      });
      if (delivered(smsResult)) {
        await Appointment.updateOne(own, { $set: { reminderSentAt: new Date() }, $unset: { reminderClaimedAt: '' } });
      } else {
        await releaseClaim(Appointment, own, 'reminderClaimedAt');
      }
      results.push({ id, code: appointment.appointmentCode, success: smsResult.success, sid: smsResult.sid, error: smsResult.error });
    } catch (error) {
      results.push({ id, success: false, error: errorMessage(error) });
    }
  }

  return results;
}

/** SMS reminders for follow-up visits (Visit.followUpDate) that fall tomorrow, clinic-local. */
async function sendTenantVisitReminders(tenant: AutomationTenant): Promise<ReminderRow[]> {
  const settings = await getSettings(tenant.tenantId);
  if (settings?.communicationSettings?.appointmentReminders === false) return [];

  const { start, end } = dayRangeOffsetInTz(1, new Date(), tenant.timezone);
  const visits = await Visit.find({
    tenantId: tenant.tenantObjectId,
    followUpDate: { $gte: start, $lte: end },
    followUpReminderSent: { $ne: true },
    status: { $ne: 'cancelled' },
  })
    .populate('patient', 'firstName lastName phone')
    .limit(BATCH_LIMIT);

  const clinicName = settings?.clinicName || tenant.name || 'the clinic';
  const results: ReminderRow[] = [];

  for (const visit of visits) {
    const id = String(visit._id);
    try {
      const patient = visit.patient as any;
      if (!patient?.phone || !visit.followUpDate) continue;

      const message =
        `Reminder from ${clinicName}: you have a follow-up visit tomorrow (${displayDate(visit.followUpDate, tenant.timezone)}).` +
        (visit.visitCode ? ` Visit Code: ${visit.visitCode}.` : '') +
        ' Please contact the clinic if you need to reschedule.';

      const own = { _id: visit._id, tenantId: tenant.tenantObjectId };
      if (!(await claimForSend(Visit, { ...own, followUpReminderSent: { $ne: true } }, 'followUpReminderClaimedAt'))) continue;
      const smsResult = await sendSMS({ to: patient.phone, message }).catch(async (error) => {
        await releaseClaim(Visit, own, 'followUpReminderClaimedAt');
        throw error;
      });
      if (delivered(smsResult)) {
        await Visit.updateOne(own, { $set: { followUpReminderSent: true }, $unset: { followUpReminderClaimedAt: '' } });
      } else {
        await releaseClaim(Visit, own, 'followUpReminderClaimedAt');
      }
      results.push({ id, code: visit.visitCode, success: smsResult.success, sid: smsResult.sid, error: smsResult.error });
    } catch (error) {
      results.push({ id, success: false, error: errorMessage(error) });
    }
  }

  return results;
}

export async function processDayBeforeReminders(tenantId?: string | Types.ObjectId): Promise<{
  appointmentReminders: ReminderRow[];
  visitReminders: ReminderRow[];
  errors: string[];
}> {
  await connectDB();
  const out = { appointmentReminders: [] as ReminderRow[], visitReminders: [] as ReminderRow[], errors: [] as string[] };

  const runs = await forEachTenant(tenantId, async (tenant) => ({
    appointments: await sendTenantAppointmentReminders(tenant),
    visits: await sendTenantVisitReminders(tenant),
  }));

  for (const run of runs) {
    if (!run.result) {
      out.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    out.appointmentReminders.push(...run.result.appointments);
    out.visitReminders.push(...run.result.visits);
  }
  return out;
}
