import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const isWalkIn = searchParams.get('isWalkIn');
    const room = searchParams.get('room');

    let query: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
    }
    if (doctorId) {
      query.doctor = doctorId;
    }
    if (patientId) {
      query.patient = patientId;
    }
    if (status) {
      // Support comma-separated statuses
      const statuses = status.split(',');
      query.status = { $in: statuses };
    }
    if (isWalkIn !== null && isWalkIn !== undefined) {
      query.isWalkIn = isWalkIn === 'true';
    }
    if (room) {
      query.room = room;
    }

    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName specialization')
      .populate('provider', 'name email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    return NextResponse.json({ success: true, data: appointments });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Auto-generate appointmentCode if not provided
    if (!body.appointmentCode) {
      const lastAppointment = await Appointment.findOne({ appointmentCode: { $exists: true, $ne: null } })
        .sort({ appointmentCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastAppointment?.appointmentCode) {
        const match = lastAppointment.appointmentCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;
    }
    
    // For walk-ins, ensure queue number is set
    if (body.isWalkIn && !body.queueNumber) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayWalkIns = await Appointment.find({
        isWalkIn: true,
        appointmentDate: { $gte: today, $lt: tomorrow },
        status: { $in: ['scheduled', 'confirmed'] },
      }).sort({ queueNumber: -1 });
      
      body.queueNumber = todayWalkIns.length > 0 
        ? (todayWalkIns[0].queueNumber || 0) + 1
        : 1;
    }
    
    // Automatically set createdBy to the authenticated user
    const appointmentData = {
      ...body,
      createdBy: session.userId,
    };
    
    const appointment = await Appointment.create(appointmentData);
    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName specialization');
    
    // Send confirmation email if status is confirmed
    if (appointment.status === 'confirmed' && appointment.patient) {
      // Trigger email reminder (async, don't wait)
      sendAppointmentReminder(appointment).catch(console.error);
    }
    
    return NextResponse.json(
      { success: true, data: appointment },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

// Email reminder function (placeholder - implement with your email service)
async function sendAppointmentReminder(appointment: any) {
  // This is a placeholder. In production, integrate with:
  // - SendGrid, AWS SES, Nodemailer, etc.
  // - SMS service like Twilio for SMS reminders
  
  const patient = appointment.patient;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime;
  
  console.log('Sending appointment reminder:', {
    to: patient.email,
    patient: `${patient.firstName} ${patient.lastName}`,
    date: appointmentDate.toLocaleDateString(),
    time: appointmentTime,
  });
  
  // TODO: Implement actual email sending
  // Example with Nodemailer:
  // await transporter.sendMail({
  //   from: 'clinic@example.com',
  //   to: patient.email,
  //   subject: 'Appointment Confirmation',
  //   html: `...`
  // });
}

