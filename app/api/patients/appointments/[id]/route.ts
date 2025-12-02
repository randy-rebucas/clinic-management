import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import logger from '@/lib/logger';

/**
 * Cancel an appointment for logged-in patient
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get patient session from cookie
    const sessionCookie = request.cookies.get('patient_session');
    
    if (!sessionCookie?.value) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    let sessionData;
    try {
      sessionData = JSON.parse(sessionCookie.value);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid session. Please login again.' },
        { status: 401 }
      );
    }

    if (!sessionData.patientId || sessionData.type !== 'patient') {
      return NextResponse.json(
        { success: false, error: 'Invalid session type.' },
        { status: 401 }
      );
    }

    await connectDB();
    
    const { id } = await params;

    // Find the appointment
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Verify the appointment belongs to this patient
    if (appointment.patient.toString() !== sessionData.patientId) {
      return NextResponse.json(
        { success: false, error: 'You can only cancel your own appointments' },
        { status: 403 }
      );
    }

    // Check if appointment can be cancelled
    if (['completed', 'cancelled', 'no-show'].includes(appointment.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot cancel an appointment that is already ${appointment.status}` },
        { status: 400 }
      );
    }

    // Check if appointment is in the past
    const appointmentDateTime = new Date(appointment.appointmentDate);
    if (appointment.appointmentTime) {
      const [hours, minutes] = appointment.appointmentTime.split(':').map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);
    }

    if (appointmentDateTime < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel past appointments' },
        { status: 400 }
      );
    }

    // Cancel the appointment
    appointment.status = 'cancelled';
    appointment.notes = `${appointment.notes ? appointment.notes + '\n' : ''}Cancelled by patient on ${new Date().toISOString()}`;
    await appointment.save();

    logger.info('Patient cancelled appointment', {
      patientId: sessionData.patientId,
      appointmentId: id,
      appointmentCode: appointment.appointmentCode,
    });

    return NextResponse.json({
      success: true,
      message: 'Appointment cancelled successfully',
    });

  } catch (error: any) {
    logger.error('Error cancelling appointment', error as Error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to cancel appointment' },
      { status: 500 }
    );
  }
}

