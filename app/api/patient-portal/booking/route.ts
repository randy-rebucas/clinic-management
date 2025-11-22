import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

/**
 * Patient portal - Booking endpoints
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    // Find patient
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId);
    } else {
      patient = await Patient.findOne({ email: (user as any).email });
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get patient's appointments
    const appointments = await Appointment.find({ patient: patient._id })
      .populate('doctor', 'firstName lastName specialization')
      .sort({ appointmentDate: -1 });

    // Get available doctors
    const doctors = await Doctor.find({ status: 'active' })
      .select('firstName lastName specialization schedule');

    return NextResponse.json({
      success: true,
      data: {
        appointments,
        doctors,
      },
    });
  } catch (error: any) {
    console.error('Error fetching booking data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch booking data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { patientId, doctorId, appointmentDate, appointmentTime, reason } = body;

    // Find patient
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId);
    } else {
      patient = await Patient.findOne({ email: (user as any).email });
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Create appointment (reuse existing appointment creation logic)
    const appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctorId || undefined,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      reason: reason || 'Patient portal booking',
      status: 'scheduled',
      source: 'patient_portal',
    });

    await appointment.populate('doctor', 'firstName lastName specialization');
    await appointment.populate('patient', 'firstName lastName patientCode');

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

