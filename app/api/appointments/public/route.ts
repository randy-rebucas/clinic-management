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
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { turnstileRejection } from '@/lib/turnstile';
import { nextPatientCode } from '@/lib/patient-schema';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentDayRange,
  findDoctorConflict,
  nextAppointmentCode,
  normalizeTime,
  timeToMinutes,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';
import {
  BOOKING_HORIZON_DAYS,
  bookingRulesFrom,
  bookingWindow,
  clinicClock,
  freeSlotsAnyDoctor,
  minutesToHHmm,
  slotRejection,
  type BookedTime,
} from '@/lib/booking-slots';

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

    const records = await Doctor.find({ status: 'active', tenantId })
      .select('firstName lastName specialization schedule availabilityOverrides')
      .lean<Record<string, any>[]>();
    // Time-off entries (and their reasons) stay private; the response keeps its old fields.
    const doctors = records.map((record) => {
      const doctor = { ...record };
      delete doctor.availabilityOverrides;
      return doctor;
    });

    if (date) {
      if ((doctorId && !isValidId(doctorId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ success: false, error: 'Invalid date or doctor' }, { status: 400 });
      }
      // With a doctor: that doctor's free slots. Without one: slots where any doctor is free.
      const candidates = doctorId ? records.filter((d) => String(d._id) === doctorId) : records;
      if (doctorId || candidates.length > 0) {
        const tz = await getTenantTimezone(tenantId);
        const clock = clinicClock(tz);
        const rules = bookingRulesFrom(await getSettings(String(tenantId)));
        const open = candidates.filter((d) => bookingWindow(d, date, rules) && date >= clock.today);

        const booked = new Map<string, BookedTime[]>();
        if (open.length > 0) {
          const { start, end } = appointmentDayRange(date, tz);
          const existing = await Appointment.find({
            tenantId,
            doctor: { $in: open.map((d) => d._id) },
            appointmentDate: { $gte: start, $lte: end },
            status: { $in: ACTIVE_APPOINTMENT_STATUSES },
          })
            .select('doctor appointmentTime duration')
            .lean<{ doctor: unknown; appointmentTime?: string; duration?: number }[]>();
          for (const apt of existing) {
            const s = timeToMinutes(apt.appointmentTime);
            if (s === null) continue;
            const key = String(apt.doctor);
            booked.set(key, [...(booked.get(key) ?? []), { start: s, duration: apt.duration }]);
          }
        }

        const availableSlots = freeSlotsAnyDoctor(
          open.map((d) => ({ doctor: d, booked: booked.get(String(d._id)) ?? [] })),
          date,
          clock,
          rules
        ).map(minutesToHHmm);

        return NextResponse.json({
          success: true,
          data: {
            availableSlots,
            doctors,
            slotMinutes: rules.slotMinutes,
          },
        });
      }
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
  turnstileToken: z.string().max(2048).optional(),
});

const SLOT_TAKEN = 'This time slot is already booked. Please choose another time.';

/** Open online requests one phone number may hold at a clinic before staff act on them. */
const MAX_PENDING_PER_PHONE = 3;

// Public endpoint for patient booking (no authentication required)
export async function POST(request: NextRequest) {
  const ipLimited = await applyRateLimit(request, rateLimiters.publicWrite);
  if (ipLimited) return ipLimited;

  try {
    await connectDB();
    const parsed = await parseBody(request, publicBookingSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const captchaRejected = await turnstileRejection(request, body.turnstileToken);
    if (captchaRejected) return captchaRejected;

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
    const phoneLimited = await applyRateLimit(request, rateLimiters.publicWritePhone, phone);
    if (phoneLimited) return phoneLimited;

    const doctor = await Doctor.findOne({ _id: body.doctorId, status: 'active', tenantId })
      .select('firstName lastName schedule availabilityOverrides')
      .lean<Record<string, any>>();
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Invalid doctor selected. Please select a doctor from this clinic.' },
        { status: 400 }
      );
    }

    // Only a slot the GET could have offered: clinic open, doctor working, on the grid, not past.
    const tz = await getTenantTimezone(tenantId);
    const rules = bookingRulesFrom(await getSettings(String(tenantId)));
    const rejection = slotRejection(doctor, body.appointmentDate, timeToMinutes(appointmentTime), clinicClock(tz), rules);
    if (rejection) {
      const error = {
        past: 'Please choose a future date and time.',
        'beyond-horizon': `Appointments can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead.`,
        'not-working': 'The clinic or doctor is not available at that time. Please choose another time.',
        'off-grid': 'Please choose one of the offered appointment times.',
      }[rejection];
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    const conflict = await findDoctorConflict({
      tenantId,
      doctorId: body.doctorId,
      appointmentDate: body.appointmentDate,
      appointmentTime,
      duration: rules.slotMinutes,
      tz,
    });
    if (conflict) {
      return NextResponse.json({ success: false, error: SLOT_TAKEN }, { status: 409 });
    }

    // Durable backstop to the rate limits: pending slots block real patients, so one number
    // can't hold more than a few at once. The note line is written below.
    const pendingForPhone = await Appointment.countDocuments({
      tenantId,
      status: 'pending',
      isWalkIn: false,
      notes: new RegExp(`^Submitted phone: \\+${phone.slice(1)}$`, 'm'),
    });
    if (pendingForPhone >= MAX_PENDING_PER_PHONE) {
      return NextResponse.json(
        { success: false, error: 'You already have booking requests waiting for the clinic to confirm. Please contact the clinic.' },
        { status: 429 }
      );
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
        duration: rules.slotMinutes,
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
