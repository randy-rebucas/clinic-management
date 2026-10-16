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

const MAX_BATCH = 200;

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

// Send SMS reminders for this clinic's upcoming appointments
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'appointments', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const hoursAhead = Math.min(Math.max(parseInt(searchParams.get('hoursAhead') || '24') || 24, 1), 72);

    const now = new Date();
    const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const appointmentsNeedingReminders = await Appointment.find(tenantFilter(ctx.tenantId, {
      appointmentDate: { $gte: now, $lte: futureTime },
      status: { $in: ['scheduled', 'confirmed'] },
    }))
      .limit(MAX_BATCH)
      .populate(populateFor(ctx.tenantObjectId));

    const tz = await getTenantTimezone(ctx.tenantId);
    const results = [];
    for (const appointment of appointmentsNeedingReminders) {
      const patient = appointment.patient as any;
      if (patient?.phone) {
        try {
          const result = await sendSMSReminder(appointment, tz);
          results.push({ appointmentId: appointment._id, success: result.success, result });
        } catch (error) {
          console.error('Error sending SMS reminder:', error);
          results.push({ appointmentId: appointment._id, success: false, error: 'Failed to send' });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} appointments`,
      data: results,
    });
  } catch (error: any) {
    console.error('Error processing SMS reminders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process SMS reminders' },
      { status: 500 }
    );
  }
}

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
