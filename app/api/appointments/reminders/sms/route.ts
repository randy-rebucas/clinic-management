import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendSMS, isSMSConfigured } from '@/lib/sms';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { findAppointmentsNeedingReminders } from '@/lib/data/appointment';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// Send SMS reminder for a specific appointment
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { appointmentId } = body;

    if (!appointmentId) {
      return NextResponse.json({ success: false, error: 'Appointment ID required' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const appointment = await run(tenantId, () =>
      prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: { select: { firstName: true, lastName: true, phone: true } },
          doctor: { select: { firstName: true, lastName: true } },
        },
      })
    );

    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    if (!appointment.patient.phone) {
      return NextResponse.json({ success: false, error: 'Patient phone number not available' }, { status: 400 });
    }

    const result = await sendSMSReminder(appointment);

    return NextResponse.json({
      success: true,
      message: 'SMS reminder sent successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Error sending SMS reminder:', error);
    return NextResponse.json({ success: false, error: 'Failed to send SMS reminder' }, { status: 500 });
  }
}

// Auto-send SMS reminders for upcoming appointments
export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const hoursAhead = parseInt(searchParams.get('hoursAhead') || '24');

    const now = new Date();
    const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const appointmentsNeedingReminders = await run(tenantId, () => findAppointmentsNeedingReminders(now, futureTime));

    const results = [];
    for (const appointment of appointmentsNeedingReminders) {
      if (appointment.patient.phone) {
        try {
          const result = await sendSMSReminder(appointment);
          results.push({ appointmentId: appointment.id, success: true, result });
        } catch (error) {
          results.push({ appointmentId: appointment.id, success: false, error: (error as Error).message });
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
    return NextResponse.json({ success: false, error: 'Failed to process SMS reminders' }, { status: 500 });
  }
}

// SMS sending function using Twilio
async function sendSMSReminder(appointment: any) {
  const patient = appointment.patient;
  const doctor = appointment.doctor;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const message = `Reminder: You have an appointment with ${doctor ? `${doctor.firstName} ${doctor.lastName}` : 'your doctor'} on ${appointmentDate.toLocaleDateString()} at ${displayTime}. Appointment Code: ${appointment.appointmentCode}. Please arrive 10 minutes early.`;

  let phoneNumber = patient.phone.trim();
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
  }

  const smsResult = await sendSMS({ to: phoneNumber, message });

  return {
    success: smsResult.success,
    sid: smsResult.sid,
    phone: phoneNumber,
    messageText: message,
    configured: isSMSConfigured(),
    error: smsResult.error,
  };
}
