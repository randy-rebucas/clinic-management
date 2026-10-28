import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { requirePermission } from '@/app/lib/auth-helpers';
import { sendSMS, isSMSConfigured } from '@/lib/sms';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { normalizePhone } from '@/lib/phone';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { Types } from 'mongoose';

function populateFor(tenantObjectId: Types.ObjectId) {
  return [
    { path: 'patient', select: 'firstName lastName phone', match: { tenantIds: tenantObjectId } },
    { path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } },
  ];
}

// Send SMS reminder for a specific appointment
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'appointments', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const appointmentId = body?.appointmentId;

    if (!isValidId(appointmentId)) {
      return NextResponse.json(
        { success: false, error: 'Appointment ID required' },
        { status: 400 }
      );
    }

    const appointment = await Appointment.findOne(tenantFilter(ctx.tenantId, { _id: appointmentId }))
      .populate(populateFor(ctx.tenantObjectId));

    if (!appointment) return notFound('Appointment');

    const patient = appointment.patient as any;
    if (!patient?.phone) {
      return NextResponse.json(
        { success: false, error: 'Patient phone number not available' },
        { status: 400 }
      );
    }

    const tz = await getTenantTimezone(ctx.tenantId);
    const result = await sendSMSReminder(appointment, tz);

    return NextResponse.json({
      success: true,
      message: 'SMS reminder sent successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Error sending SMS reminder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send SMS reminder' },
      { status: 500 }
    );
  }
}

// Bulk reminders are sent by the reminders cron (lib/automations/appointment-reminders.ts). There is
// deliberately no GET here: a GET that sends SMS can be triggered cross-site by a link or redirect,
// and is not blocked for read-only view-as sessions.

async function sendSMSReminder(appointment: any, tz: string) {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentTime = appointment.appointmentTime || '';
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours >= 12
      ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
      : `${hours}:${minutes.toString().padStart(2, '0')} AM`
    : 'TBD';
  const dateText = appointment.appointmentDate ? formatInTz(appointment.appointmentDate, 'MMM d, yyyy', tz) : 'TBD';

  const message = `Reminder: You have an appointment with ${doctor ? `${doctor.firstName} ${doctor.lastName}` : 'your doctor'} on ${dateText} at ${displayTime}. Appointment Code: ${appointment.appointmentCode}. Please arrive 10 minutes early.`;

  const phoneNumber = normalizePhone(patient.phone);
  if (!phoneNumber) {
    return { success: false, configured: isSMSConfigured(), error: 'Invalid phone number' };
  }

  const smsResult = await sendSMS({
    to: phoneNumber,
    message,
  });

  return {
    success: smsResult.success,
    sid: smsResult.sid,
    phone: phoneNumber,
    messageText: message,
    configured: isSMSConfigured(),
    error: smsResult.success ? undefined : 'Failed to send',
  };
}
