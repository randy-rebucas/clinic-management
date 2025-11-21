import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendSMS, isSMSConfigured } from '@/lib/sms';

// Send SMS reminder for a specific appointment
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { appointmentId } = body;

    if (!appointmentId) {
      return NextResponse.json(
        { success: false, error: 'Appointment ID required' },
        { status: 400 }
      );
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName phone')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    const patient = appointment.patient as any;
    if (!patient.phone) {
      return NextResponse.json(
        { success: false, error: 'Patient phone number not available' },
        { status: 400 }
      );
    }

    // Send SMS reminder
    const result = await sendSMSReminder(appointment);

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

// Auto-send SMS reminders for upcoming appointments
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const hoursAhead = parseInt(searchParams.get('hoursAhead') || '24');

    // Find appointments in the next N hours that need reminders
    const now = new Date();
    const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const appointmentsNeedingReminders = await Appointment.find({
      appointmentDate: { $gte: now, $lte: futureTime },
      status: { $in: ['scheduled', 'confirmed'] },
    })
      .populate('patient', 'firstName lastName phone')
      .populate('doctor', 'firstName lastName');

    const results = [];
    for (const appointment of appointmentsNeedingReminders) {
      const patient = appointment.patient as any;
      if (patient.phone) {
        try {
          const result = await sendSMSReminder(appointment);
          results.push({ appointmentId: appointment._id, success: true, result });
        } catch (error) {
          results.push({ appointmentId: appointment._id, success: false, error: (error as Error).message });
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

// SMS sending function using Twilio
async function sendSMSReminder(appointment: any) {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12 
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const message = `Reminder: You have an appointment with ${doctor ? `${doctor.firstName} ${doctor.lastName}` : 'your doctor'} on ${appointmentDate.toLocaleDateString()} at ${displayTime}. Appointment Code: ${appointment.appointmentCode}. Please arrive 10 minutes early.`;

  // Format phone number (ensure it starts with + and country code)
  let phoneNumber = patient.phone.trim();
  if (!phoneNumber.startsWith('+')) {
    // If no country code, assume it needs one (you may want to add country code detection)
    phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`; // Default to US (+1)
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
    error: smsResult.error,
  };
}

