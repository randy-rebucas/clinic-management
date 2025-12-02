import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { sendSMS } from '@/lib/sms';
import logger from '@/lib/logger';

/**
 * Get available doctors and time slots for patient booking
 */
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');

    // Get available doctors
    const doctors = await Doctor.find({ status: 'active' })
      .select('firstName lastName specialization schedule')
      .lean();

    // Get available time slots for a specific date and doctor
    if (date && doctorId) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await Appointment.find({
        doctor: doctorId,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['scheduled', 'confirmed', 'pending'] },
      }).select('appointmentTime duration').lean();

      // Generate available time slots (9 AM to 5 PM, 30-minute intervals)
      const availableSlots: string[] = [];
      const bookedSlots = new Set(
        existingAppointments.map((apt: any) => apt.appointmentTime)
      );

      for (let hour = 9; hour < 17; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          if (!bookedSlots.has(timeSlot)) {
            availableSlots.push(timeSlot);
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          availableSlots,
          doctors,
        },
      });
    }

    // Return just doctors if no date/doctor specified
    return NextResponse.json({
      success: true,
      data: { doctors },
    });
  } catch (error: any) {
    logger.error('Error fetching appointment data for patient', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointment data' },
      { status: 500 }
    );
  }
}

/**
 * Create appointment for logged-in patient
 */
export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { doctorId, appointmentDate, appointmentTime, reason } = body;

    // Validate required fields
    if (!doctorId || !appointmentDate || !appointmentTime) {
      return NextResponse.json(
        { success: false, error: 'Doctor, date, and time are required' },
        { status: 400 }
      );
    }

    // Get patient info
    const Patient = (await import('@/models/Patient')).default;
    const patient = await Patient.findById(sessionData.patientId);
    
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Check for conflicts
    const appointmentDateObj = new Date(appointmentDate);
    const startOfDay = new Date(appointmentDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingAppointment = await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      appointmentTime: appointmentTime,
      status: { $in: ['scheduled', 'confirmed', 'pending'] },
    });

    if (conflictingAppointment) {
      return NextResponse.json(
        { success: false, error: 'This time slot is no longer available. Please choose another time.' },
        { status: 409 }
      );
    }

    // Check if patient already has an appointment at this time
    const patientConflict = await Appointment.findOne({
      patient: sessionData.patientId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      appointmentTime: appointmentTime,
      status: { $in: ['scheduled', 'confirmed', 'pending'] },
    });

    if (patientConflict) {
      return NextResponse.json(
        { success: false, error: 'You already have an appointment at this time.' },
        { status: 409 }
      );
    }

    // Auto-generate appointmentCode
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

    const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

    // Create appointment
    const appointment = await Appointment.create({
      patient: sessionData.patientId,
      doctor: doctorId,
      appointmentCode,
      appointmentDate: appointmentDateObj,
      appointmentTime,
      duration: 30,
      status: 'pending', // Requires confirmation from clinic
      reason: reason || 'General Consultation',
      isWalkIn: false,
    });

    await appointment.populate('patient', 'firstName lastName email phone patientCode');
    await appointment.populate('doctor', 'firstName lastName specialization');

    // Send confirmation SMS
    sendBookingConfirmation(appointment).catch(console.error);

    logger.info('Patient booked appointment', {
      patientId: sessionData.patientId,
      appointmentCode,
      doctorId,
      appointmentDate,
      appointmentTime,
    });

    return NextResponse.json(
      {
        success: true,
        data: appointment,
        message: 'Appointment request submitted successfully. You will receive a confirmation shortly.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    logger.error('Error creating patient appointment', error as Error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

// Send booking confirmation via SMS
async function sendBookingConfirmation(appointment: any) {
  const patient = appointment.patient;
  const doctor = appointment.doctor;
  const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const appointmentTime = appointment.appointmentTime;
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12 
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const message = `Hi ${patient.firstName}! Your appointment request (${appointment.appointmentCode}) has been submitted. Date: ${appointmentDate} at ${displayTime}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Status: Pending confirmation. We'll notify you once confirmed.`;

  if (patient.phone) {
    let phoneNumber = patient.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      if (phoneNumber.length === 10) {
        phoneNumber = `+1${phoneNumber}`;
      } else if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+${phoneNumber}`;
      }
    }

    await sendSMS({
      to: phoneNumber,
      message,
    }).catch((error) => {
      console.error('Failed to send booking confirmation SMS:', error);
    });
  }

  console.log('Booking confirmation sent:', {
    patient: `${patient.firstName} ${patient.lastName}`,
    code: appointment.appointmentCode,
  });
}

