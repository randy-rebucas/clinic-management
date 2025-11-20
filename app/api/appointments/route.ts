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

    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName email phone')
      .populate('doctor', 'firstName lastName specialization')
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
    
    // Automatically set createdBy to the authenticated user
    const appointmentData = {
      ...body,
      createdBy: session.userId,
    };
    
    const appointment = await Appointment.create(appointmentData);
    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName specialization');
    return NextResponse.json(
      { success: true, data: appointment },
      { status: 201 }
    );
  } catch (error: any) {
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

