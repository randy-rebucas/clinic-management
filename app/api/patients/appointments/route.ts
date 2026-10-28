import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { doctorSummary, PATIENT_DOCTOR_POPULATE } from '../_lib/doctor-summary';
import { getTenantContext } from '@/lib/tenant';
import { isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { weekSummary } from '@/lib/doctors';
import { getSettings } from '@/lib/settings';
import { withPatientTeleconsult } from '@/lib/teleconsult';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentDayRange,
  findDoctorConflict,
  nextAppointmentCode,
  normalizeTime,
  timeToMinutes,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';
import { memberTenantIds } from '../me/_lib/patient-scope';
import { linkedRecords, recordAtClinic } from '../me/_lib/linked-records';
import {
  bookingHorizon,
  bookingRulesFrom,
  bookingWindow,
  clinicClock,
  freeSlots,
  minutesToHHmm,
  slotRejection,
} from '@/lib/booking-slots';
import { requireActiveEmcr } from '@/lib/emcr/activation';

/**
 * Which of the patient's clinics this request is for: the subdomain's clinic (when the
 * patient belongs to it), else an explicitly requested one, else their first clinic.
 * `clinicIds` is already narrowed to the session's clinic (memberTenantIds). A malformed
 * `tenantId` is a 400 and one outside that scope a 403, as on the /me list routes.
 */
async function resolvePatientClinic(
  clinicIds: unknown[],
  requested?: string | null
): Promise<Types.ObjectId | null | NextResponse> {
  const ids = clinicIds.map(String);
  const param = requested?.trim();
  if (param && !isValidId(param)) {
    return NextResponse.json({ success: false, error: 'Invalid tenantId.' }, { status: 400 });
  }
  if (param && !ids.includes(param)) {
    return NextResponse.json({ success: false, error: 'Not available for this clinic.' }, { status: 403 });
  }
  const ctx = await getTenantContext();
  if (ctx.tenantId) return ids.includes(ctx.tenantId) ? new Types.ObjectId(ctx.tenantId) : null;
  if (param) return new Types.ObjectId(param);
  return ids[0] ? new Types.ObjectId(ids[0]) : null;
}

/** The booked appointment as the patient sees it: no internal staff notes, no raw video room. */
function toPatientBooking(appointment: { toObject?: () => Record<string, any> } & Record<string, any>, tz: string) {
  const { notes: _notes, createdBy: _createdBy, ...rest } =
    typeof appointment.toObject === 'function' ? appointment.toObject() : appointment;
  return withPatientTeleconsult(rest, { tz, displayName: rest.patient?.firstName });
}

/** Video visits are offered when the clinic turned them on and its plan includes them. */
async function teleconsultOffered(tenantId: Types.ObjectId): Promise<boolean> {
  const settings = await getSettings(String(tenantId));
  if (settings.appointmentSettings?.teleconsultBooking !== true) return false;
  return (await checkSubscriptionLimit(tenantId, 'useFeature', 'teleconsult')).allowed;
}

/**
 * Get available doctors and time slots for patient booking
 */
export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) return patientAuthError(request);

    await connectDB();

    const patient = await Patient.findById(sessionData.patientId).select('tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    // Every clinic this person is registered at (their linked records included).
    const linked = await linkedRecords(patient as any);

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');

    const tenantId = await resolvePatientClinic(
      memberTenantIds(linked.tenantIds, sessionData),
      searchParams.get('tenantId')
    );
    if (tenantId instanceof NextResponse) return tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: true, data: { doctors: [] } });
    }

    const tz = await getTenantTimezone(tenantId);
    const clock = clinicClock(tz);
    const horizon = bookingHorizon(clock.today);
    // Opening hours + usual appointment length narrow every doctor's slots.
    const rules = bookingRulesFrom(await getSettings(String(tenantId)));

    const records = await Doctor.find({ status: 'active', tenantId })
      .select('firstName lastName specializationId schedule availabilityOverrides')
      .populate(PATIENT_DOCTOR_POPULATE.populate)
      .lean<Record<string, any>[]>();
    // Patients get computed availability, not the raw schedule (time-off reasons stay private).
    const doctors = records.map(({ schedule, availabilityOverrides, ...doctor }) => ({
      ...doctorSummary(doctor),
      hoursSummary: weekSummary(schedule ?? []),
      bookableDates: horizon.filter((key) => bookingWindow({ schedule, availabilityOverrides }, key, rules)),
    }));

    if (date && doctorId) {
      if (!isValidId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ success: false, error: 'Invalid date or doctor' }, { status: 400 });
      }
      const record = records.find((d) => String(d._id) === doctorId);
      if (!record || !horizon.includes(date) || !bookingWindow(record, date, rules)) {
        return NextResponse.json({ success: true, data: { availableSlots: [], dayOff: true, doctors } });
      }
      const { start, end } = appointmentDayRange(date, tz);

      const existingAppointments = await Appointment.find({
        tenantId,
        doctor: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: start, $lte: end },
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      })
        .select('appointmentTime duration')
        .lean();

      const booked = (existingAppointments as any[]).flatMap((apt) => {
        const s = timeToMinutes(apt.appointmentTime);
        return s === null ? [] : [{ start: s, duration: apt.duration }];
      });

      // The doctor's slot grid that day inside the clinic's opening hours, today's past slots
      // dropped (clinic time); the POST accepts exactly these (slotRejection), minus what is booked.
      const availableSlots = freeSlots(record, date, clock, booked, rules).map(minutesToHHmm);

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
      data: { doctors, teleconsultAvailable: await teleconsultOffered(tenantId) },
    });
  } catch (error: any) {
    logger.error('Error fetching appointment data for patient', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointment data' },
      { status: 500 }
    );
  }
}

const portalBookingSchema = z.object({
  doctorId: zObjectId,
  appointmentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid appointment date.'),
  appointmentTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Appointment time must be in HH:mm format.'),
  reason: z.string().trim().max(500).optional(),
  modality: z.enum(['in-person', 'teleconsult']).optional(),
});

/**
 * Create appointment for logged-in patient
 */
export async function POST(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) return patientAuthError(request);
    const locked = await requireActiveEmcr(sessionData, 'booking');
    if (locked) return locked;

    await connectDB();

    const parsed = await parseBody(request, portalBookingSchema);
    if (isValidationError(parsed)) return parsed;
    const { doctorId, reason } = parsed.data;
    const video = parsed.data.modality === 'teleconsult';
    const appointmentDate = parsed.data.appointmentDate.slice(0, 10);
    const appointmentTime = normalizeTime(parsed.data.appointmentTime);

    const appointmentDateObj = new Date(appointmentDate);
    if (isNaN(appointmentDateObj.getTime()) || !appointmentTime) {
      return NextResponse.json({ success: false, error: 'Invalid appointment date.' }, { status: 400 });
    }

    const signedIn = await Patient.findById(sessionData.patientId).select('tenantIds accountId').lean() as any;
    if (!signedIn) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    const linked = await linkedRecords(signedIn);

    // The clinic is the doctor's clinic, and the patient must be registered there.
    const doctor = await Doctor.findOne({ _id: doctorId, status: 'active' })
      .select('tenantId firstName lastName schedule availabilityOverrides')
      .lean() as any;
    // The patient's clinics, narrowed to the session's clinic when it carries one.
    const patientClinics: string[] = memberTenantIds(linked.tenantIds, sessionData).map(String);
    if (!doctor?.tenantId || !patientClinics.includes(String(doctor.tenantId))) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }
    const tenantId = doctor.tenantId as Types.ObjectId;
    // Book on this person's record at the doctor's clinic (each clinic keeps its own record).
    const patientId = recordAtClinic(linked, tenantId);
    const patient = patientId
      ? ((await Patient.findById(patientId).select('tenantIds firstName phone').lean()) as any)
      : null;
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    const ctx = await getTenantContext();
    if (ctx.tenantId && ctx.tenantId !== String(tenantId)) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    // Only a slot the GET could have offered: not in the past (clinic time), inside the
    // booking horizon, inside the doctor's hours and the clinic's opening hours, on the slot grid.
    const tz = await getTenantTimezone(tenantId);
    const rules = bookingRulesFrom(await getSettings(String(tenantId)));
    const rejection = slotRejection(doctor, appointmentDate, timeToMinutes(appointmentTime), clinicClock(tz), rules);
    if (rejection) {
      const error = {
        past: 'Please choose a future date and time.',
        'beyond-horizon': 'Appointments can only be booked up to 60 days ahead.',
        'not-working': `Dr. ${doctor.lastName} isn't seeing patients at that time. Please choose another time.`,
        'off-grid': 'Please choose one of the offered appointment times.',
      }[rejection];
      return NextResponse.json({ success: false, error, code: `SLOT_${rejection.toUpperCase().replace('-', '_')}` }, { status: 400 });
    }

    const conflictingAppointment = await findDoctorConflict({
      tenantId,
      doctorId,
      appointmentDate,
      appointmentTime,
      duration: rules.slotMinutes,
      tz,
    });
    if (conflictingAppointment) {
      return NextResponse.json(
        { success: false, error: 'This time slot is no longer available. Please choose another time.' },
        { status: 409 }
      );
    }

    const { start, end } = appointmentDayRange(appointmentDate, tz);
    const patientConflict = await Appointment.findOne({
      tenantId,
      patient: patient._id,
      appointmentDate: { $gte: start, $lte: end },
      appointmentTime,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    }).select('_id').lean();

    if (patientConflict) {
      return NextResponse.json(
        { success: false, error: 'You already have an appointment at this time.' },
        { status: 409 }
      );
    }

    const limitCheck = await checkSubscriptionLimit(tenantId, 'createAppointment');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'The clinic is not accepting online bookings right now. Please contact the clinic.' },
        { status: 403 }
      );
    }

    if (video && !(await teleconsultOffered(tenantId))) {
      return NextResponse.json(
        { success: false, error: 'This clinic isn’t offering video visits. Please book a visit at the clinic.' },
        { status: 403 }
      );
    }

    const appointmentCode = await nextAppointmentCode(tenantId);

    let appointment;
    try {
      appointment = await Appointment.create({
        tenantId,
        patient: patient._id,
        doctor: doctor._id,
        appointmentCode,
        appointmentDate: appointmentDateObj,
        appointmentTime,
        duration: rules.slotMinutes,
        status: 'pending', // Requires confirmation from clinic
        reason: reason || 'General Consultation',
        isWalkIn: false,
        modality: video ? 'teleconsult' : 'in-person',
      });
    } catch (err: any) {
      if (isSlotDuplicateError(err)) {
        return NextResponse.json(
          { success: false, error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409 }
        );
      }
      throw err;
    }

    await appointment.populate({
      path: 'patient',
      select: 'firstName lastName email phone patientCode',
      match: { tenantIds: tenantId },
    });
    await appointment.populate({
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: { path: 'specializationId', select: 'name' },
      match: { tenantId },
    });

    after(() => sendBookingConfirmation(appointment, tz).catch(console.error));

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
        data: toPatientBooking(appointment as any, tz),
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
async function sendBookingConfirmation(appointment: any, tz: string) {
  const patient = appointment.patient;
  const doctor = appointment.doctor;
  if (!patient) return;
  const appointmentDate = formatInTz(appointment.appointmentDate, 'EEEE, MMMM d, yyyy', tz);
  const [hours, minutes] = String(appointment.appointmentTime).split(':').map(Number);
  const displayTime = hours >= 12
    ? `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} PM`
    : `${hours}:${minutes.toString().padStart(2, '0')} AM`;

  const video = appointment.modality === 'teleconsult';
  const message = `Hi ${patient.firstName}! Your ${video ? 'video visit' : 'appointment'} request (${appointment.appointmentCode}) has been submitted. Date: ${appointmentDate} at ${displayTime}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Status: Pending confirmation. We'll notify you once confirmed.${video ? ' Join from the eMCR app, from 15 minutes before the start.' : ''}`;

  const phoneNumber = patient.phone ? normalizePhone(patient.phone) : null;
  if (phoneNumber) {
    await sendSMS({
      to: phoneNumber,
      message,
    }).catch((error) => {
      console.error('Failed to send booking confirmation SMS:', error);
    });
  }
}
