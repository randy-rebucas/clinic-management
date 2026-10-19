import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { logRecordOpened } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zShortText, zLongText } from '@/lib/api/validate';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  findDoctorConflict,
  normalizeTime,
  isSlotDuplicateError,
} from '@/lib/appointment-booking';
import { newRoomName } from '@/lib/teleconsult';

const STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled', 'no-show', 'completed', 'cancelled'] as const;

const updateAppointmentSchema = z.object({
  status: z.enum(STATUSES).optional(),
  doctor: zObjectId.optional(),
  room: zShortText.optional(),
  appointmentDate: z.string().min(1).max(40).optional(),
  appointmentTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid time').optional(),
  scheduledAt: z.string().max(40).optional(),
  duration: z.coerce.number().int().min(15).max(240).optional(),
  reason: zShortText.optional(),
  notes: zLongText.optional(),
  estimatedWaitTime: z.coerce.number().int().min(0).max(1440).optional(),
  modality: z.enum(['in-person', 'teleconsult']).optional(),
  _skipAutomation: z.boolean().optional(),
});

function populateOptions(tenantObjectId: Types.ObjectId) {
  return {
    patient: { path: 'patient', select: 'firstName lastName email phone', match: { tenantIds: tenantObjectId } },
    doctor: {
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: { path: 'specializationId', select: 'name' },
      match: { tenantId: tenantObjectId },
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'appointments', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Appointment');

    const pop = populateOptions(ctx.tenantObjectId);
    const appointment = await Appointment.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .populate(pop.patient)
      .populate(pop.doctor);
    if (!appointment) return notFound('Appointment');
    after(() =>
      logRecordOpened({
        session: ctx.session,
        tenantId: ctx.tenantId,
        resource: 'appointment',
        resourceId: id,
        patientId: (appointment.patient as any)?._id,
        request,
      })
    );
    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointment' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Appointment');

    const parsed = await parseBody(request, updateAppointmentSchema);
    if (isValidationError(parsed)) return parsed;
    const { _skipAutomation, ...fields } = parsed.data;

    const query = tenantFilter(tenantId, { _id: id });
    const oldAppointment = await Appointment.findOne(query).lean() as any;
    if (!oldAppointment) return notFound('Appointment');

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (fields.appointmentTime) {
      const t = normalizeTime(fields.appointmentTime);
      if (!t) return NextResponse.json({ success: false, error: 'Invalid time' }, { status: 400 });
      update.appointmentTime = t;
    }
    for (const key of ['appointmentDate', 'scheduledAt'] as const) {
      if (fields[key]) {
        const d = new Date(fields[key] as string);
        if (isNaN(d.getTime())) return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 });
        update[key] = d;
      }
    }
    if (fields.doctor) {
      const doctor = await Doctor.exists({ _id: fields.doctor, tenantId: tenantObjectId });
      if (!doctor) {
        return NextResponse.json(
          { success: false, error: 'Invalid doctor selected. Please select a doctor from this clinic.' },
          { status: 400 }
        );
      }
      update.doctor = new Types.ObjectId(fields.doctor);
    }

    // Switching to video needs the plan, and a room (updates skip the model's validate hook).
    if (fields.modality === 'teleconsult' && oldAppointment.modality !== 'teleconsult') {
      if (oldAppointment.isWalkIn) {
        return NextResponse.json({ success: false, error: 'A walk-in can’t be a video visit.' }, { status: 400 });
      }
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const plan = await checkSubscriptionLimit(tenantId, 'useFeature', 'teleconsult');
      if (!plan.allowed) {
        return NextResponse.json({ success: false, error: 'Video visits are part of the Professional and Enterprise plans.' }, { status: 403 });
      }
      if (!oldAppointment.teleconsult?.roomName) update['teleconsult.roomName'] = newRoomName();
    }

    const next = { ...oldAppointment, ...update };
    const slotChanged = ['doctor', 'appointmentDate', 'appointmentTime', 'duration'].some((k) => k in update)
      || (fields.status && !ACTIVE_APPOINTMENT_STATUSES.includes(oldAppointment.status) && ACTIVE_APPOINTMENT_STATUSES.includes(fields.status));
    if (slotChanged && next.doctor && next.appointmentDate && next.appointmentTime && !next.isWalkIn
      && ACTIVE_APPOINTMENT_STATUSES.includes(next.status)) {
      const conflict = await findDoctorConflict({
        tenantId,
        doctorId: next.doctor,
        appointmentDate: fields.appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(fields.appointmentDate)
          ? fields.appointmentDate
          : next.appointmentDate,
        appointmentTime: next.appointmentTime,
        duration: next.duration,
        tz: await getTenantTimezone(tenantId),
        excludeId: id,
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, error: 'The doctor already has an appointment at this time. Please choose another time.' },
          { status: 409 }
        );
      }
    }

    const pop = populateOptions(tenantObjectId);
    let appointment;
    try {
      appointment = await Appointment.findOneAndUpdate(query, { $set: update }, {
        new: true,
        runValidators: true,
      })
        .populate(pop.patient)
        .populate(pop.doctor);
    } catch (err: any) {
      if (isSlotDuplicateError(err)) {
        return NextResponse.json(
          { success: false, error: 'The doctor already has an appointment at this time. Please choose another time.' },
          { status: 409 }
        );
      }
      throw err;
    }
    if (!appointment) return notFound('Appointment');

    const statusChangedToCancelled = oldAppointment.status !== 'cancelled' && fields.status === 'cancelled';
    if (statusChangedToCancelled) {
      import('@/lib/automations/waitlist-management').then(({ fillCancelledSlot }) => {
        fillCancelledSlot(appointment._id, tenantObjectId)
          .catch((error) => {
            console.error('Error filling cancelled slot from waitlist:', error);
          });
      }).catch((error) => {
        console.error('Error loading waitlist management module:', error);
      });
    }

    const oldStatus = oldAppointment.status;
    const newStatus = fields.status;
    if (oldStatus !== newStatus && newStatus && _skipAutomation !== true) {
      import('@/lib/automations/queue-from-appointment').then(({ updateQueueFromAppointment }) => {
        updateQueueFromAppointment({
          appointmentId: appointment._id,
          patientId: appointment.patient,
          newAppointmentStatus: newStatus,
          tenantId: tenantObjectId,
        }).catch((error) => {
          console.error('[Appointment API] Error in queue automation:', error);
        });
      }).catch((error) => {
        console.error('[Appointment API] Error loading queue automation module:', error);
      });
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid appointment data' },
        { status: 400 }
      );
    }
    console.error('Error updating appointment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update appointment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'appointments', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Appointment');

    const appointment = await Appointment.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!appointment) return notFound('Appointment');
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete appointment' },
      { status: 500 }
    );
  }
}
