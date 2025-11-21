import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { sendSMS } from '@/lib/sms';

// Public endpoint for patient online booking (no authentication required)
export async function GET(request: NextRequest) {
  try {
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
        status: { $in: ['scheduled', 'confirmed'] },
      }).select('appointmentTime duration').lean();

      // Generate available time slots (9 AM to 5 PM, 30-minute intervals)
      const availableSlots: string[] = [];
      const bookedSlots = new Set(
        existingAppointments.map((apt: any) => {
          const [hours, minutes] = apt.appointmentTime.split(':').map(Number);
          return `${hours}:${minutes}`;
        })
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
    console.error('Error fetching public appointment data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointment data' },
      { status: 500 }
    );
  }
}

// Public endpoint for patient booking (no authentication required)
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { patientEmail, patientPhone, patientFirstName, patientLastName, doctorId, appointmentDate, appointmentTime, reason, room } = body;

    // Validate required fields
    if (!patientEmail || !patientPhone || !patientFirstName || !patientLastName || !doctorId || !appointmentDate || !appointmentTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find or create patient
    let patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      // Create new patient
      patient = await Patient.create({
        firstName: patientFirstName,
        lastName: patientLastName,
        email: patientEmail,
        phone: patientPhone,
        patientCode: `PAT-${Date.now()}`,
      });
    } else {
      // Update patient info if needed
      patient.firstName = patientFirstName;
      patient.lastName = patientLastName;
      patient.phone = patientPhone;
      await patient.save();
    }

    // Check for conflicts
    const appointmentDateTime = new Date(appointmentDate);
    const [hours, minutes] = appointmentTime.split(':').map(Number);
    appointmentDateTime.setHours(hours, minutes, 0, 0);

    const conflictingAppointment = await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      appointmentTime: appointmentTime,
      status: { $in: ['scheduled', 'confirmed'] },
    });

    if (conflictingAppointment) {
      return NextResponse.json(
        { success: false, error: 'This time slot is already booked. Please choose another time.' },
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
      patient: patient._id,
      doctor: doctorId,
      appointmentCode,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      duration: 30,
      status: 'pending', // Requires confirmation
      reason,
      room,
      isWalkIn: false,
    });

    await appointment.populate('patient', 'firstName lastName email phone');
    await appointment.populate('doctor', 'firstName lastName specialization');

    // Send confirmation email/SMS (async)
    sendBookingConfirmation(appointment).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        data: appointment,
        message: 'Appointment request submitted successfully. You will receive a confirmation shortly.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating public appointment:', error);
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
  const appointmentDate = new Date(appointment.appointmentDate).toLocaleDateString();
  const appointmentTime = appointment.appointmentTime;
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12 
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const message = `Your appointment request (${appointment.appointmentCode}) is pending confirmation. Date: ${appointmentDate} at ${displayTime}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. You will receive a confirmation shortly.`;

  if (patient.phone) {
    let phoneNumber = patient.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
    }

    await sendSMS({
      to: phoneNumber,
      message,
    }).catch((error) => {
      console.error('Failed to send booking confirmation SMS:', error);
    });
  }

  console.log('Booking confirmation sent:', {
    to: patient.email,
    phone: patient.phone,
    patient: `${patient.firstName} ${patient.lastName}`,
    code: appointment.appointmentCode,
  });
}

