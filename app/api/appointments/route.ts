import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { registerAllModels } from '@/models';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zShortText, zLongText } from '@/lib/api/validate';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import {
  appointmentDayRange,
  findDoctorConflict,
  nextAppointmentCode,
  nextWalkInNumber,
  normalizeTime,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled', 'no-show', 'completed', 'cancelled'] as const;

const createAppointmentSchema = z.object({
  patient: zObjectId,
  doctor: z.union([zObjectId, z.literal('')]).optional().transform((v) => v || undefined),
  room: zShortText.optional(),
  appointmentDate: z.string().min(1).max(40).optional(),
  appointmentTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid time').optional().or(z.literal('').transform(() => undefined)),
  scheduledAt: z.string().max(40).optional(),
  duration: z.coerce.number().int().min(15).max(240).optional(),
  reason: zShortText.optional(),
  notes: zLongText.optional(),
  status: z.enum(STATUSES).optional(),
  isWalkIn: z.boolean().optional(),
  estimatedWaitTime: z.coerce.number().int().min(0).max(1440).optional(),
  modality: z.enum(['in-person', 'teleconsult']).optional(),
});

function parseDateInput(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    registerAllModels();
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const doctorId = searchParams.get('doctorId');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const isWalkIn = searchParams.get('isWalkIn');
    const room = searchParams.get('room');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);

    const query: any = { tenantId: tenantObjectId };
    if (date) {
      const tz = await getTenantTimezone(tenantId);
      const { start, end } = appointmentDayRange(date, tz);
      query.appointmentDate = { $gte: start, $lte: end };
    } else if (startDate || endDate) {
      const range: any = {};
      const from = parseDateInput(startDate);
      const to = parseDateInput(endDate);
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      if (Object.keys(range).length) query.appointmentDate = range;
    }
    if (doctorId) {
      if (!isValidId(doctorId)) return NextResponse.json({ success: true, data: [] });
      query.doctor = new Types.ObjectId(doctorId);
    }
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (status) {
      const statuses = status.split(',').filter((s) => (STATUSES as readonly string[]).includes(s));
      query.status = { $in: statuses };
    }
    if (isWalkIn !== null && isWalkIn !== undefined) {
      query.isWalkIn = isWalkIn === 'true';
    }
    if (room) {
      query.room = room;
    }

    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
      match: { tenantId: tenantObjectId },
    };

    // Patient model uses tenantIds (array) since patients can belong to multiple clinics
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName email phone',
      match: { tenantIds: tenantObjectId },
    };

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate(patientPopulateOptions)
        .populate(doctorPopulateOptions)
        .populate('provider', 'name email')
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: appointments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

const SLOT_TAKEN = 'The doctor already has an appointment at this time. Please choose another time.';

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    registerAllModels();
    const parsed = await parseBody(request, createAppointmentSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
    const limitCheck = await checkSubscriptionLimit(tenantId, 'createAppointment');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'Subscription limit exceeded',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    if (body.modality === 'teleconsult') {
      if (body.isWalkIn) {
        return NextResponse.json({ success: false, error: 'A walk-in can’t be a video visit.' }, { status: 400 });
      }
      const teleconsultCheck = await checkSubscriptionLimit(tenantId, 'useFeature', 'teleconsult');
      if (!teleconsultCheck.allowed) {
        return NextResponse.json({ success: false, error: 'Video visits are part of the Professional and Enterprise plans.' }, { status: 403 });
      }
    }

    if (body.doctor) {
      const doctor = await Doctor.findOne({ _id: body.doctor, tenantId: tenantObjectId }).select('_id').lean();
      if (!doctor) {
        return NextResponse.json(
          { success: false, error: 'Invalid doctor selected. Please select a doctor from this clinic.' },
          { status: 400 }
        );
      }
    }

    const patient = await Patient.findOne({ _id: body.patient, tenantIds: tenantObjectId }).select('_id').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
        { status: 400 }
      );
    }

    const settings = await getSettings(tenantId);
    const tz = await getTenantTimezone(tenantId);
    const duration = body.duration || settings.appointmentSettings?.defaultDuration || 30;
    const appointmentTime = body.appointmentTime ? normalizeTime(body.appointmentTime) || undefined : undefined;
    const appointmentDate = parseDateInput(body.appointmentDate);
    const scheduledAt = parseDateInput(body.scheduledAt);

    if (body.appointmentDate && !appointmentDate) {
      return NextResponse.json({ success: false, error: 'Invalid appointment date' }, { status: 400 });
    }

    const status = body.status || 'scheduled';
    if (body.doctor && appointmentDate && appointmentTime && !body.isWalkIn && !['cancelled', 'completed', 'no-show'].includes(status)) {
      const conflict = await findDoctorConflict({
        tenantId,
        doctorId: body.doctor,
        appointmentDate: body.appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(body.appointmentDate)
          ? body.appointmentDate
          : appointmentDate,
        appointmentTime,
        duration,
        tz,
      });
      if (conflict) {
        return NextResponse.json({ success: false, error: SLOT_TAKEN }, { status: 409 });
      }
    }

    const appointmentData: any = {
      patient: new Types.ObjectId(body.patient),
      doctor: body.doctor ? new Types.ObjectId(body.doctor) : undefined,
      room: body.modality === 'teleconsult' ? undefined : body.room,
      modality: body.modality ?? 'in-person',
      appointmentDate,
      appointmentTime,
      scheduledAt,
      duration,
      reason: body.reason,
      notes: body.notes,
      status,
      isWalkIn: !!body.isWalkIn,
      estimatedWaitTime: body.estimatedWaitTime,
      appointmentCode: await nextAppointmentCode(tenantId),
      createdBy: session.userId,
      tenantId: tenantObjectId,
    };

    // Walk-in numbers are always allocated server-side; a client-computed number races.
    if (appointmentData.isWalkIn) {
      appointmentData.queueNumber = await nextWalkInNumber(tenantId, tz, appointmentDate || new Date());
    }

    let appointment;
    try {
      appointment = await Appointment.create(appointmentData);
    } catch (err: any) {
      if (isSlotDuplicateError(err)) {
        return NextResponse.json({ success: false, error: SLOT_TAKEN }, { status: 409 });
      }
      throw err;
    }

    await appointment.populate({
      path: 'patient',
      select: 'firstName lastName email phone',
      match: { tenantIds: tenantObjectId },
    });
    await appointment.populate({
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: { path: 'specializationId', select: 'name' },
      match: { tenantId: tenantObjectId },
    });

    if (appointment.patient && settings?.automationSettings?.autoInsuranceVerification) {
      const { autoVerifyInsuranceForAppointment } = await import('@/lib/automations/insurance-verification');
      autoVerifyInsuranceForAppointment(appointment._id, tenantId).catch(console.error);
    }

    if (!appointment.doctor && !appointment.provider && settings?.automationSettings?.autoSmartAssignment) {
      const { assignDoctorToAppointment } = await import('@/lib/automations/smart-assignment');
      assignDoctorToAppointment({
        appointmentId: appointment._id,
        patientId: appointment.patient,
        appointmentDate: appointment.appointmentDate || appointment.scheduledAt,
        appointmentTime: appointment.appointmentTime || '09:00',
        reason: appointment.reason,
        tenantId: tenantObjectId,
      }).catch((error) => {
        console.error('Error in smart appointment assignment:', error);
      });
    }

    return NextResponse.json(
      { success: true, data: appointment },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid appointment data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}
