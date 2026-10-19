import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { requireApiKey, isApiError, apiError, pageParams, pageOf, parseApiBody } from '@/lib/api-keys';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { findDoctorConflict, isSlotDuplicateError, nextAppointmentCode, normalizeTime } from '@/lib/appointment-booking';
import { serializeAppointment } from '@/lib/public-api';

const STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled', 'no-show', 'completed', 'cancelled'] as const;
const PUBLIC_FIELDS =
  'appointmentCode patient doctor appointmentDate appointmentTime scheduledAt duration status modality isWalkIn queueNumber reason createdAt updatedAt';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/appointments — newest first.
 * Query: limit, cursor, date_from / date_to (YYYY-MM-DD, inclusive), status, patient_id, doctor_id.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireApiKey(request, 'appointments:read');
  if (isApiError(ctx)) return ctx;
  const page = pageParams(request);
  if (page instanceof NextResponse) return page;

  const sp = request.nextUrl.searchParams;
  const filter: Record<string, unknown> = { tenantId: ctx.tenantObjectId };
  if (page.after) filter._id = { $lt: page.after };

  const from = sp.get('date_from');
  const to = sp.get('date_to');
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) return apiError(400, 'invalid_parameter', 'date_from and date_to use YYYY-MM-DD.');
  if (from || to) {
    filter.appointmentDate = {
      ...(from ? { $gte: new Date(`${from}T00:00:00Z`) } : {}),
      ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }
  const status = sp.get('status');
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) return apiError(400, 'invalid_parameter', `status must be one of ${STATUSES.join(', ')}.`);
    filter.status = status;
  }
  for (const [param, field] of [['patient_id', 'patient'], ['doctor_id', 'doctor']] as const) {
    const v = sp.get(param);
    if (v) {
      if (!Types.ObjectId.isValid(v)) return apiError(400, 'invalid_parameter', `${param} is not a valid id.`);
      filter[field] = new Types.ObjectId(v);
    }
  }

  await connectDB();
  const [rows, tz] = await Promise.all([
    Appointment.find(filter).select(PUBLIC_FIELDS).sort({ _id: -1 }).limit(page.limit + 1).lean<any[]>(),
    getTenantTimezone(ctx.tenantId),
  ]);
  return NextResponse.json(pageOf(rows.map((a) => serializeAppointment(a, tz)), page.limit));
}

const zId = z.string().regex(/^[a-f0-9]{24}$/i, 'Not a valid id');

const CreateSchema = z.object({
  patient_id: zId,
  doctor_id: zId,
  date: z.string().regex(YMD, 'Use YYYY-MM-DD'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:mm (24-hour)'),
  duration_minutes: z.number().int().min(15).max(240).optional(),
  reason: z.string().trim().max(500).optional(),
  status: z.enum(['pending', 'scheduled', 'confirmed']).optional(),
});

/** POST /api/v1/appointments — book an in-person appointment with a doctor. 409 when the slot is taken. */
export async function POST(request: NextRequest) {
  const ctx = await requireApiKey(request, 'appointments:write');
  if (isApiError(ctx)) return ctx;
  const parsed = await parseApiBody(request, CreateSchema);
  if (parsed instanceof NextResponse) return parsed;
  const b = parsed.data;

  const appointmentTime = normalizeTime(b.time);
  if (!appointmentTime) return apiError(400, 'validation_failed', 'time: not a valid time of day');
  const appointmentDate = new Date(`${b.date}T00:00:00Z`);
  if (Number.isNaN(appointmentDate.getTime())) return apiError(400, 'validation_failed', 'date: not a real date');

  await connectDB();
  const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
  const limit = await checkSubscriptionLimit(ctx.tenantId, 'createAppointment');
  if (!limit.allowed) return apiError(403, 'plan_limit', limit.reason || 'The clinic has reached its plan’s appointment limit.');

  const [doctor, patient] = await Promise.all([
    Doctor.findOne({ _id: b.doctor_id, tenantId: ctx.tenantObjectId }).select('_id status').lean<any>(),
    Patient.findOne({ _id: b.patient_id, tenantIds: ctx.tenantObjectId }).select('_id').lean(),
  ]);
  if (!doctor) return apiError(404, 'not_found', 'No such doctor in this clinic.');
  if (!patient) return apiError(404, 'not_found', 'No such patient in this clinic.');

  const [settings, tz] = await Promise.all([getSettings(ctx.tenantId), getTenantTimezone(ctx.tenantId)]);
  const duration = b.duration_minutes || settings.appointmentSettings?.defaultDuration || 30;

  const conflict = await findDoctorConflict({ tenantId: ctx.tenantId, doctorId: b.doctor_id, appointmentDate: b.date, appointmentTime, duration, tz });
  if (conflict) return apiError(409, 'slot_taken', 'The doctor already has an appointment at this time.');

  let appointment: any;
  try {
    appointment = await Appointment.create({
      tenantId: ctx.tenantObjectId,
      patient: new Types.ObjectId(b.patient_id),
      doctor: new Types.ObjectId(b.doctor_id),
      modality: 'in-person',
      appointmentDate,
      appointmentTime,
      duration,
      reason: b.reason,
      status: b.status ?? 'scheduled',
      isWalkIn: false,
      appointmentCode: await nextAppointmentCode(ctx.tenantId),
    });
  } catch (error: any) {
    if (isSlotDuplicateError(error)) return apiError(409, 'slot_taken', 'The doctor already has an appointment at this time.');
    if (error.name === 'ValidationError') return apiError(400, 'validation_failed', 'The appointment is not valid.');
    throw error;
  }

  // appointment.created goes out from the model's save hook (lib/webhook-events.ts)
  return NextResponse.json(serializeAppointment(appointment.toObject(), tz), { status: 201 });
}
