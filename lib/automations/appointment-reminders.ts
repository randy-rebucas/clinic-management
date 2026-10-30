// Day-before appointment and follow-up visit reminders (used by /api/cron/reminders)

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendSMS, type SMSResult } from '@/lib/sms';
import { sendPushToPatientDevices, type PushPayload } from '@/lib/push-notifications';
import { buildAppointmentActionUrl } from '@/lib/appointment-links';
import { dayRangeOffsetInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, delivered, displayDate, displayTime, errorMessage, claimForSend, releaseClaim, BATCH_LIMIT, type AutomationTenant } from './shared';

type ReminderRow = { id: string; code?: string; success: boolean; sid?: string; error?: string; pushed?: boolean };

/** SMS when the patient has a phone; a thrown send counts as a failed one. */
async function smsIfPhone(phone: string | undefined, message: string): Promise<SMSResult | null> {
  if (!phone) return null;
  return sendSMS({ to: phone, message }).catch((error) => ({ success: false, error: errorMessage(error) }));
}

/** Push to the patient's app (and their family managers'). Never throws; true when a device got it. */
async function pushReminder(patientId: unknown, payload: PushPayload, tenantId: Types.ObjectId): Promise<boolean> {
  try {
    return (await sendPushToPatientDevices(String(patientId), payload, { tenantId })).sent;
  } catch (error) {
    console.error('Error sending reminder push notification:', error);
    return false;
  }
}

/**
 * SMS and push reminders for tomorrow's (clinic-local) appointments. Each appointment is claimed
 * before anything goes out and marked with `reminderSentAt` once either channel delivered, so
 * reruns and overlapping runs don't resend; when neither did, the claim is given back and the
 * next run that day tries again. The SMS goes out whether or not the push did (a push can sit
 * unseen on a silenced phone, and the clinic relies on this reminder).
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
      if (!patient?._id) continue;

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
      const smsResult = await smsIfPhone(patient.phone, message);
      // Lock-screen text: when, never who or why.
      const pushed = await pushReminder(patient._id, {
        title: 'Appointment Tomorrow',
        body: `${dateText} at ${timeText}. Tap for details.`,
        tag: `appointment-reminder-${id}`,
        url: `/appointments/${id}`,
      }, tenant.tenantObjectId);

      if (delivered(smsResult) || pushed) {
        await Appointment.updateOne(own, { $set: { reminderSentAt: new Date() }, $unset: { reminderClaimedAt: '' } });
      } else {
        await releaseClaim(Appointment, own, 'reminderClaimedAt');
      }
      // No phone and no app to reach: nothing was attempted, as before.
      if (!smsResult && !pushed) continue;
      results.push({
        id,
        code: appointment.appointmentCode,
        success: !!smsResult?.success || pushed,
        sid: smsResult?.sid,
        error: pushed ? undefined : smsResult?.error,
        pushed,
      });
    } catch (error) {
      results.push({ id, success: false, error: errorMessage(error) });
    }
  }

  return results;
}

/**
 * SMS and push reminders for follow-up visits (Visit.followUpDate) that fall tomorrow,
 * clinic-local. The push opens the booked follow-up appointment when there is one.
 */
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
      if (!patient?._id || !visit.followUpDate) continue;

      const message =
        `Reminder from ${clinicName}: you have a follow-up visit tomorrow (${displayDate(visit.followUpDate, tenant.timezone)}).` +
        (visit.visitCode ? ` Visit Code: ${visit.visitCode}.` : '') +
        ' Please contact the clinic if you need to reschedule.';

      const own = { _id: visit._id, tenantId: tenant.tenantObjectId };
      if (!(await claimForSend(Visit, { ...own, followUpReminderSent: { $ne: true } }, 'followUpReminderClaimedAt'))) continue;
      const smsResult = await smsIfPhone(patient.phone, message);
      const appointmentId = visit.followUpAppointmentId ? String(visit.followUpAppointmentId) : null;
      const pushed = await pushReminder(patient._id, {
        title: 'Follow-up Visit Tomorrow',
        body: `${displayDate(visit.followUpDate, tenant.timezone)}. ${appointmentId ? 'Tap for details.' : 'Tap to book a time.'}`,
        tag: `followup-${id}`,
        ...(appointmentId ? { data: { appointmentId } } : {}),
      }, tenant.tenantObjectId);

      if (delivered(smsResult) || pushed) {
        await Visit.updateOne(own, { $set: { followUpReminderSent: true }, $unset: { followUpReminderClaimedAt: '' } });
      } else {
        await releaseClaim(Visit, own, 'followUpReminderClaimedAt');
      }
      if (!smsResult && !pushed) continue;
      results.push({
        id,
        code: visit.visitCode,
        success: !!smsResult?.success || pushed,
        sid: smsResult?.sid,
        error: pushed ? undefined : smsResult?.error,
        pushed,
      });
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
