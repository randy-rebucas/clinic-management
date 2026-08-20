import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listDoctors } from '@/lib/data/doctor';
import {
  findConflictingAppointment,
  getMaxAppointmentCodeNumber,
  createAppointment,
} from '@/lib/data/appointment';
import { findPatientAcrossTenants, createPatient, updatePatient, addPatientToTenant } from '@/lib/data/patient';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// Public endpoint for patient online booking (no authentication required)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');
    const tenantIdParam = searchParams.get('tenantId');

    const tenantContext = await getTenantContext();
    const tenantId = tenantIdParam || tenantContext.tenantId;

    const doctors = await run(tenantId, () => listDoctors({ status: 'active' }));

    if (date && doctorId) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await run(tenantId, () =>
        prisma.appointment.findMany({
          where: {
            doctorId,
            appointmentDate: { gte: startOfDay, lte: endOfDay },
            status: { in: ['scheduled', 'confirmed'] },
          },
          select: { appointmentTime: true, duration: true },
        })
      );

      const availableSlots: string[] = [];
      const bookedSlots = new Set(
        existingAppointments.map((apt) => {
          const [hours, minutes] = (apt.appointmentTime ?? '0:0').split(':').map(Number);
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

      return NextResponse.json({ success: true, data: { availableSlots, doctors } });
    }

    return NextResponse.json({ success: true, data: { doctors } });
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
    const body = await request.json();
    const { patientEmail, patientPhone, patientFirstName, patientLastName, doctorId, appointmentDate, appointmentTime, reason, room, tenantId: bodyTenantId } = body;

    if (!patientEmail || !patientPhone || !patientFirstName || !patientLastName || !doctorId || !appointmentDate || !appointmentTime) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = bodyTenantId || tenantContext.tenantId;

    const result = await run(tenantId, async () => {
      // Validate that the doctor belongs to the tenant
      if (tenantId) {
        const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, status: 'active' } });
        if (!doctor) {
          throw new ValidationError('Invalid doctor selected. Please select a doctor from this clinic.');
        }
      }

      // Find or create patient (tenant-scoped junction lookup)
      const existingPatient = await findPatientAcrossTenants({ email: patientEmail, tenantId: tenantId ?? undefined });
      let patientId: string;
      if (!existingPatient) {
        const created = await createPatient(
          {
            firstName: patientFirstName,
            lastName: patientLastName,
            email: patientEmail,
            phone: patientPhone,
            patientCode: `PAT-${Date.now()}`,
          },
          { tenantId: tenantId ?? undefined }
        );
        patientId = created.id;
      } else {
        patientId = existingPatient.id;
        await updatePatient(patientId, {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: patientPhone,
        });
        if (tenantId) {
          await addPatientToTenant(patientId, tenantId);
        }
      }

      // Check for conflicts
      const conflictingAppointment = await findConflictingAppointment(doctorId, new Date(appointmentDate), appointmentTime);
      if (conflictingAppointment) {
        throw new ConflictError('This time slot is already booked. Please choose another time.');
      }

      // Auto-generate appointmentCode
      const nextNumber = (await getMaxAppointmentCodeNumber()) + 1;
      const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

      return createAppointment({
        appointmentCode,
        appointmentDate: new Date(appointmentDate),
        appointmentTime,
        duration: 30,
        status: 'pending',
        reason: reason ?? undefined,
        room: room ?? undefined,
        isWalkIn: false,
        patient: { connect: { id: patientId } },
        doctor: { connect: { id: doctorId } },
      });
    });

    // Send confirmation email/SMS (async)
    sendBookingConfirmation(result).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: 'Appointment request submitted successfully. You will receive a confirmation shortly.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating public appointment:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

class ValidationError extends Error {}
class ConflictError extends Error {}

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

  if (patient?.phone) {
    let phoneNumber = patient.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
    }

    await sendSMS({ to: phoneNumber, message }).catch((error) => {
      console.error('Failed to send booking confirmation SMS:', error);
    });
  }
}
