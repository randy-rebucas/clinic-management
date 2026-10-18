import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { doctorSummary, PATIENT_DOCTOR_POPULATE } from '../_lib/doctor-summary';
import { getTenantContext } from '@/lib/tenant';
import { isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentDayRange,
  findDoctorConflict,
  nextAppointmentCode,
  normalizeTime,
  timeToMinutes,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';

/**
 * Which of the patient's clinics this request is for: the subdomain's clinic (when the
 * patient belongs to it), else an explicitly requested one, else their first clinic.
 */
async function resolvePatientClinic(patientTenantIds: Types.ObjectId[], requested?: string | null) {
  const ids = (patientTenantIds || []).map(String);
  const ctx = await getTenantContext();
  if (ctx.tenantId) return ids.includes(ctx.tenantId) ? new Types.ObjectId(ctx.tenantId) : null;
  if (requested && isValidId(requested)) return ids.includes(requested) ? new Types.ObjectId(requested) : null;
  return ids[0] ? new Types.ObjectId(ids[0]) : null;
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

    await connectDB();

    const patient = await Patient.findById(sessionData.patientId).select('tenantIds').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');

    const tenantId = await resolvePatientClinic((patient as any).tenantIds, searchParams.get('tenantId'));
    if (!tenantId) {
      return NextResponse.json({ success: true, data: { doctors: [] } });
    }

    const doctors = (
      await Doctor.find({ status: 'active', tenantId })
        .select('firstName lastName specializationId schedule')
        .populate(PATIENT_DOCTOR_POPULATE.populate)
        .lean<Record<string, any>[]>()
    ).map(doctorSummary);

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

      const booked: Array<[number, number]> = [];
      for (const apt of existingAppointments as any[]) {
        const s = timeToMinutes(apt.appointmentTime);
        if (s !== null) booked.push([s, s + (apt.duration || 30)]);
      }

      // Generate available time slots (9 AM to 5 PM, 30-minute intervals)
      const availableSlots: string[] = [];
      for (let hour = 9; hour < 17; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const slotStart = hour * 60 + minute;
          const taken = booked.some(([s, e]) => slotStart < e && s < slotStart + 30);
          if (!taken) {
            availableSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
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
});

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

    await connectDB();

    const parsed = await parseBody(request, portalBookingSchema);
    if (isValidationError(parsed)) return parsed;
    const { doctorId, reason } = parsed.data;
    const appointmentDate = parsed.data.appointmentDate.slice(0, 10);
    const appointmentTime = normalizeTime(parsed.data.appointmentTime);

    const appointmentDateObj = new Date(appointmentDate);
    if (isNaN(appointmentDateObj.getTime()) || !appointmentTime) {
      return NextResponse.json({ success: false, error: 'Invalid appointment date.' }, { status: 400 });
    }

    const patient = await Patient.findById(sessionData.patientId).select('tenantIds firstName phone').lean() as any;
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // The clinic is the doctor's clinic, and the patient must be registered there.
    const doctor = await Doctor.findOne({ _id: doctorId, status: 'active' }).select('tenantId firstName lastName').lean() as any;
    const patientClinics: string[] = (patient.tenantIds || []).map(String);
    if (!doctor?.tenantId || !patientClinics.includes(String(doctor.tenantId))) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }
    const tenantId = doctor.tenantId as Types.ObjectId;
    const ctx = await getTenantContext();
    if (ctx.tenantId && ctx.tenantId !== String(tenantId)) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    const tz = await getTenantTimezone(tenantId);
    if (formatInTz(new Date(), 'yyyy-MM-dd', tz) > appointmentDate) {
      return NextResponse.json({ success: false, error: 'Please choose a future date.' }, { status: 400 });
    }

    const conflictingAppointment = await findDoctorConflict({
      tenantId,
      doctorId,
      appointmentDate,
      appointmentTime,
      duration: 30,
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
        duration: 30,
        status: 'pending', // Requires confirmation from clinic
        reason: reason || 'General Consultation',
        isWalkIn: false,
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

    sendBookingConfirmation(appointment, tz).catch(console.error);

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

  const message = `Hi ${patient.firstName}! Your appointment request (${appointment.appointmentCode}) has been submitted. Date: ${appointmentDate} at ${displayTime}${doctor ? ` with Dr. ${doctor.firstName} ${doctor.lastName}` : ''}. Status: Pending confirmation. We'll notify you once confirmed.`;

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
