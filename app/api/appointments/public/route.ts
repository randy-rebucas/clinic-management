import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Tenant from '@/models/Tenant';
import { sendSMS } from '@/lib/sms';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import { isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zEmail, zPhone, zShortText } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { nextPatientCode } from '@/lib/patient-schema';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentDayRange,
  findDoctorConflict,
  nextAppointmentCode,
  normalizeTime,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';

/**
 * Resolve the clinic for a public request. The subdomain wins; on the root domain the
 * booking page lets the visitor pick a clinic, so an explicit id is accepted only if it
 * names an active tenant.
 */
async function resolvePublicTenant(explicitTenantId: unknown): Promise<Types.ObjectId | null> {
  const ctx = await getTenantContext();
  if (ctx.tenantId) return new Types.ObjectId(ctx.tenantId);
  if (!isValidId(explicitTenantId)) return null;
  const tenant = await Tenant.findOne({ _id: explicitTenantId, status: 'active' }).select('_id').lean() as any;
  return tenant ? (tenant._id as Types.ObjectId) : null;
}

// Public endpoint for patient online booking (no authentication required)
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');

    const tenantId = await resolvePublicTenant(searchParams.get('tenantId'));
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });
    }

    const doctors = await Doctor.find({ status: 'active', tenantId })
      .select('firstName lastName specialization schedule')
      .lean();

    if (date && doctorId) {
      if (!isValidId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ success: false, error: 'Invalid date or doctor' }, { status: 400 });
      }
      const tz = await getTenantTimezone(tenantId);
      const { start, end } = appointmentDayRange(date, tz);

      const existingAppointments = await Appointment.find({
        tenantId,
        doctor: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: start, $lte: end },
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      })
        .select('appointmentTime duration')
        .lean();

      // Mark every 30-minute slot an existing appointment overlaps (zero-padded keys).
      const bookedSlots = new Set<string>();
      for (const apt of existingAppointments as any[]) {
        const time = normalizeTime(apt.appointmentTime);
        if (!time) continue;
        const [h, m] = time.split(':').map(Number);
        const startMin = h * 60 + m;
        const endMin = startMin + (apt.duration || 30);
        for (let slot = Math.floor(startMin / 30) * 30; slot < endMin; slot += 30) {
          bookedSlots.add(`${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`);
        }
      }

      const availableSlots: string[] = [];
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

const publicBookingSchema = z.object({
  patientEmail: zEmail,
  patientPhone: zPhone,
  patientFirstName: zShortText.min(1).max(100),
  patientLastName: zShortText.min(1).max(100),
  doctorId: zObjectId,
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  appointmentTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid time'),
  reason: z.string().trim().max(1000).optional(),
  room: zShortText.optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  tenantId: zObjectId.optional(),
});

const SLOT_TAKEN = 'This time slot is already booked. Please choose another time.';

// Public endpoint for patient booking (no authentication required)
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const parsed = await parseBody(request, publicBookingSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const tenantId = await resolvePublicTenant(body.tenantId);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });
    }

    const appointmentTime = normalizeTime(body.appointmentTime);
    if (!appointmentTime) {
      return NextResponse.json({ success: false, error: 'Invalid time' }, { status: 400 });
    }

    const phone = normalizePhone(body.patientPhone);
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 });
    }

    const doctor = await Doctor.findOne({ _id: body.doctorId, status: 'active', tenantId })
      .select('firstName lastName')
      .lean();
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Invalid doctor selected. Please select a doctor from this clinic.' },
        { status: 400 }
      );
    }

    const tz = await getTenantTimezone(tenantId);
    if (formatInTz(new Date(), 'yyyy-MM-dd', tz) > body.appointmentDate) {
      return NextResponse.json({ success: false, error: 'Please choose a future date.' }, { status: 400 });
    }

    const conflict = await findDoctorConflict({
      tenantId,
      doctorId: body.doctorId,
      appointmentDate: body.appointmentDate,
      appointmentTime,
      duration: 30,
      tz,
    });
    if (conflict) {
      return NextResponse.json({ success: false, error: SLOT_TAKEN }, { status: 409 });
    }

    const limitCheck = await checkSubscriptionLimit(tenantId, 'createAppointment');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'This clinic is not accepting online bookings right now. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // An existing patient is linked by email but never modified from this unauthenticated
    // endpoint: changing their phone here would let anyone take over the OTP login.
    // The booking stays "pending" until staff confirm it.
    let patient = await Patient.findOne({ email: body.patientEmail, tenantIds: tenantId }).select('_id phone firstName lastName');
    if (!patient) {
      const patientLimit = await checkSubscriptionLimit(tenantId, 'createPatient');
      if (!patientLimit.allowed) {
        return NextResponse.json(
          { success: false, error: 'This clinic is not accepting online bookings right now. Please contact the clinic.' },
          { status: 403 }
        );
      }
      // The booking form doesn't collect date of birth / sex (both required on Patient);
      // staff complete the record when confirming the pending booking.
      patient = new Patient({
        firstName: body.patientFirstName,
        lastName: body.patientLastName,
        email: body.patientEmail,
        phone,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        sex: body.sex,
        patientCode: await nextPatientCode(),
        tenantIds: [tenantId],
      });
      await patient.save({ validateBeforeSave: !!(body.dateOfBirth && body.sex) });
    }

    const bookingNote = [
      'Online booking request.',
      `Submitted name: ${body.patientFirstName} ${body.patientLastName}`,
      `Submitted phone: ${phone}`,
    ].join('\n');

    let appointment;
    try {
      appointment = await Appointment.create({
        tenantId,
        patient: patient._id,
        doctor: new Types.ObjectId(body.doctorId),
        appointmentCode: await nextAppointmentCode(tenantId),
        appointmentDate: new Date(body.appointmentDate),
        appointmentTime,
        duration: 30,
        status: 'pending',
        reason: body.reason,
        room: body.room,
        notes: bookingNote,
        isWalkIn: false,
      });
    } catch (err: any) {
      if (isSlotDuplicateError(err)) {
        return NextResponse.json({ success: false, error: SLOT_TAKEN }, { status: 409 });
      }
      throw err;
    }

    // Send only to the number submitted with this request, never to a stored number.
    sendBookingConfirmation({
      appointmentCode: appointment.appointmentCode,
      appointmentDate: body.appointmentDate,
      appointmentTime,
      doctor,
      phone,
    }).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        data: {
          appointmentCode: appointment.appointmentCode,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          status: appointment.status,
          doctor: { firstName: (doctor as any).firstName, lastName: (doctor as any).lastName },
        },
        message: 'Appointment request submitted successfully. You will receive a confirmation shortly.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating public appointment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

async function sendBookingConfirmation(info: {
  appointmentCode?: string;
  appointmentDate: string;
  appointmentTime: string;
  doctor: any;
  phone: string;
}) {
  const [hours, minutes] = info.appointmentTime.split(':').map(Number);
  const displayTime = hours >= 12
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const message = `Your appointment request (${info.appointmentCode}) is pending confirmation. Date: ${info.appointmentDate} at ${displayTime}${info.doctor ? ` with Dr. ${info.doctor.firstName} ${info.doctor.lastName}` : ''}. You will receive a confirmation shortly.`;

  await sendSMS({ to: info.phone, message }).catch((error) => {
    console.error('Failed to send booking confirmation SMS:', error);
  });
}
