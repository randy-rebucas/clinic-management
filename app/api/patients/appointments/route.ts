import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import {
  listAppointments,
  createAppointment,
  findConflictingAppointment,
  getMaxAppointmentCodeNumber,
} from '@/lib/data/appointment';
import { listDoctors, findActiveDoctorById } from '@/lib/data/doctor';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Get available doctors and time slots for patient booking
 */
export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    const patient = await runAsSystem(() => getPatientById(sessionData.patientId));
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const patientTenantId = (patient as any).tenantIds?.[0];

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');

    // Get available doctors (tenant-scoped)
    const doctors = await run(patientTenantId, () => listDoctors({ status: 'active' }));

    // Get available time slots for a specific date and doctor
    if (date && doctorId) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await run(patientTenantId, () =>
        listAppointments({
          doctorId,
          appointmentDate: { gte: startOfDay, lte: endOfDay },
          status: { in: ['scheduled', 'confirmed', 'pending'] },
        })
      );

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
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const doctorId = typeof body.doctorId === 'string' ? body.doctorId.trim() : '';
    const appointmentDate = typeof body.appointmentDate === 'string' ? body.appointmentDate.trim() : '';
    const appointmentTime = typeof body.appointmentTime === 'string' ? body.appointmentTime.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    // Validate required fields
    if (!doctorId || !appointmentDate || !appointmentTime) {
      return NextResponse.json(
        { success: false, error: 'Doctor, date, and time are required' },
        { status: 400 }
      );
    }

    const appointmentDateObj = new Date(appointmentDate);
    if (isNaN(appointmentDateObj.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid appointment date.' }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(appointmentTime)) {
      return NextResponse.json({ success: false, error: 'Appointment time must be in HH:mm format.' }, { status: 400 });
    }

    // Get patient info
    const patient = await runAsSystem(() => getPatientById(sessionData.patientId));

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get tenantId from patient (Patient schema uses tenantIds array)
    const patientTenantId = (patient as any).tenantIds?.[0];

    const result = await run(patientTenantId, async () => {
      const startOfDay = new Date(appointmentDateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(appointmentDateObj);
      endOfDay.setHours(23, 59, 59, 999);

      // Check for conflicts (tenant-scoped)
      const conflictingAppointment = await findConflictingAppointment(doctorId, appointmentDateObj, appointmentTime);
      if (conflictingAppointment) {
        return { error: 'This time slot is no longer available. Please choose another time.', status: 409 };
      }

      // Check if patient already has an appointment at this time (tenant-scoped)
      const patientConflicts = await listAppointments({
        patientId: sessionData.patientId,
        appointmentDate: { gte: startOfDay, lte: endOfDay },
        appointmentTime,
        status: { in: ['scheduled', 'confirmed', 'pending'] },
      });
      if (patientConflicts.length > 0) {
        return { error: 'You already have an appointment at this time.', status: 409 };
      }

      // Validate that doctor belongs to tenant
      const doctor = await findActiveDoctorById(doctorId);
      if (!doctor) {
        return { error: 'Doctor not found', status: 404 };
      }

      // Auto-generate appointmentCode (tenant-scoped)
      const nextNumber = (await getMaxAppointmentCodeNumber()) + 1;
      const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

      const appointment = await createAppointment({
        patient: { connect: { id: sessionData.patientId } },
        doctor: { connect: { id: doctorId } },
        appointmentCode,
        appointmentDate: appointmentDateObj,
        appointmentTime,
        duration: 30,
        status: 'pending', // Requires confirmation from clinic
        reason: reason || 'General Consultation',
        isWalkIn: false,
      } as any);

      return { appointment, doctor };
    });

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    const { appointment } = result;

    // Send confirmation SMS
    sendBookingConfirmation(appointment, patient).catch(console.error);

    logger.info('Patient booked appointment', {
      patientId: sessionData.patientId,
      appointmentCode: appointment.appointmentCode,
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
      { success: false, error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

// Send booking confirmation via SMS
async function sendBookingConfirmation(appointment: any, patient: any) {
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
}
