import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { sendSMS } from '@/lib/sms';

// This endpoint should be called by a cron job service (e.g., Vercel Cron, cron-job.org, etc.)
// For security, you should add authentication via a secret token
export async function GET(request: NextRequest) {
  // Optional: Add authentication via secret token
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    await connectDB();
    const results = {
      appointmentReminders: await sendAppointmentReminders(),
      visitReminders: await sendVisitReminders(),
    };

    return NextResponse.json({
      success: true,
      message: 'Reminders processed',
      data: results,
    });
  } catch (error: any) {
    console.error('Error processing reminders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process reminders' },
      { status: 500 }
    );
  }
}

// Send appointment reminders (24 hours before)
async function sendAppointmentReminders() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Find appointments tomorrow that haven't been reminded
  const appointments = await Appointment.find({
    appointmentDate: { $gte: tomorrow, $lt: dayAfter },
    status: { $in: ['scheduled', 'confirmed'] },
  })
    .populate('patient', 'firstName lastName phone')
    .populate('doctor', 'firstName lastName');

  const results = [];
  for (const appointment of appointments) {
    const patient = appointment.patient as any;
    if (patient.phone) {
      try {
        const appointmentDate = new Date(appointment.appointmentDate);
        const appointmentTime = appointment.appointmentTime || 'TBD';
        const [hours, minutes] = appointmentTime.split(':').map(Number);
        const displayTime = hours >= 12 
          ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
          : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

        const doctor = appointment.doctor as any;
        const message = `Reminder: You have an appointment with ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'your doctor'} tomorrow (${appointmentDate.toLocaleDateString()}) at ${displayTime}. Appointment Code: ${appointment.appointmentCode}. Please arrive 10 minutes early.`;

        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message,
        });

        results.push({
          appointmentId: appointment._id,
          appointmentCode: appointment.appointmentCode,
          success: smsResult.success,
          sid: smsResult.sid,
          error: smsResult.error,
        });
      } catch (error) {
        results.push({
          appointmentId: appointment._id,
          success: false,
          error: (error as Error).message,
        });
      }
    }
  }

  return results;
}

// Send visit follow-up reminders
async function sendVisitReminders() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Find visits with follow-up dates tomorrow that haven't been reminded
  const visits = await Visit.find({
    followUpDate: { $gte: tomorrow, $lt: dayAfter },
    followUpReminderSent: { $ne: true },
    status: { $ne: 'cancelled' },
  })
    .populate('patient', 'firstName lastName phone email')
    .populate('provider', 'name');

  const results = [];
  for (const visit of visits) {
    const patient = visit.patient as any;
    if (patient.phone && visit.followUpDate) {
      try {
        const followUpDate = new Date(visit.followUpDate);
        const message = `Reminder: You have a follow-up appointment scheduled for tomorrow (${followUpDate.toLocaleDateString()}). Visit Code: ${visit.visitCode}. Please contact the clinic if you need to reschedule.`;

        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message,
        });

        if (smsResult.success) {
          visit.followUpReminderSent = true;
          await visit.save();
        }

        results.push({
          visitId: visit._id,
          visitCode: visit.visitCode,
          success: smsResult.success,
          sid: smsResult.sid,
          error: smsResult.error,
        });
      } catch (error) {
        results.push({
          visitId: visit._id,
          success: false,
          error: (error as Error).message,
        });
      }
    }
  }

  return results;
}

