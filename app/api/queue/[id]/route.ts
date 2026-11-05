import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Room from '@/models/Room';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { vitalsSchema } from '@/lib/visit-schema';
import { findConsultBlocker } from '@/lib/queue-consult';
import { callNextPatient } from '@/lib/automations/queue-auto-call';

const updateQueueSchema = z.object({
  status: z.enum(['waiting', 'in-progress', 'away', 'completed', 'cancelled', 'no-show']).optional(),
  awayReason: z.enum(['lab', 'missed']).optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  doctor: zObjectId.nullable().optional(),
  room: zObjectId.nullable().optional(),
  estimatedWaitTime: z.coerce.number().min(0).max(1440).optional(),
  checkedIn: z.boolean().optional(),
  checkInMethod: z.enum(['manual', 'qr_code', 'kiosk', 'app']).optional(),
  completionNotes: z.string().max(5000).optional(),
  nextAction: z.enum(['billing', 'pharmacy', 'lab', 'checkout']).optional(),
  notes: z.string().max(5000).optional(),
  vitals: vitalsSchema.optional(),
  _skipAutomation: z.boolean().optional(),
});

function badId() {
  return NextResponse.json({ success: false, error: 'Invalid queue ID' }, { status: 400 });
}

function notFoundResponse() {
  return NextResponse.json({ success: false, error: 'Queue entry not found' }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    void [Doctor, Patient, Room, Appointment];

    const { id } = await params;
    if (!isValidId(id)) return badId();

    const queue = await Queue.findOne(tenantFilter(tenantId, { _id: new Types.ObjectId(id) }))
      .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'appointment', select: 'appointmentCode appointmentDate appointmentTime', match: { tenantId: tenantObjectId } })
      .lean();

    if (!queue) return notFoundResponse();

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('[GET /api/queue/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch queue entry' },
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

  const permissionCheck = await requirePermission(session, 'queue', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return badId();

    const parsed = await parseBody(request, updateQueueSchema);
    if (isValidationError(parsed)) return parsed;
    const { _skipAutomation, vitals, awayReason, ...fields } = parsed.data;

    if (fields.doctor && !(await Doctor.exists({ _id: fields.doctor, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    if (fields.room && !(await Room.exists({ _id: fields.room, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    const currentQueue = await Queue.findOne(tenantFilter(tenantId, { _id: new Types.ObjectId(id) }));
    if (!currentQueue) return notFoundResponse();

    const oldStatus = currentQueue.status;

    // Finished is final: a screen that hasn't caught up can't complete a no-show or call in someone who left.
    if (fields.status && fields.status !== oldStatus && !['waiting', 'in-progress', 'away'].includes(oldStatus)) {
      return NextResponse.json({ success: false, error: 'This patient has already left the queue.' }, { status: 409 });
    }
    // A stale screen must not reopen a finished entry, or skip a step of the lab round trip.
    if (fields.status === 'waiting' && !['waiting', 'in-progress', 'away'].includes(oldStatus)) {
      return NextResponse.json({ success: false, error: 'This patient has already left the queue.' }, { status: 409 });
    }
    // The lab is a doctor's call, made in consult. Anyone in line can turn out not to be here.
    const holdReason = awayReason ?? 'lab';
    if (fields.status === 'away' && oldStatus !== 'in-progress' && !(holdReason === 'missed' && oldStatus === 'waiting')) {
      const error = holdReason === 'missed' ? 'Only a patient in line or in consult can be marked as not here.' : 'Only a patient in consult can be sent to the lab.';
      return NextResponse.json({ success: false, error }, { status: 409 });
    }
    if (fields.status === 'in-progress' && oldStatus === 'away') {
      return NextResponse.json({ success: false, error: 'Mark this patient as back first.' }, { status: 409 });
    }

    const nextDoctor = fields.doctor !== undefined ? fields.doctor : currentQueue.doctor;
    const entersConsult = (fields.status ?? oldStatus) === 'in-progress'
      && (oldStatus !== 'in-progress' || String(nextDoctor ?? '') !== String(currentQueue.doctor ?? ''));
    if (entersConsult) {
      const blocker = await findConsultBlocker(tenantObjectId, { _id: currentQueue._id, doctor: nextDoctor });
      if (blocker) return NextResponse.json({ success: false, error: blocker }, { status: 409 });
    }

    if (vitals) {
      currentQueue.vitals = { ...(currentQueue.vitals || {}), ...vitals };
      currentQueue.markModified('vitals');
    }
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (currentQueue as any)[key] = value;
    }
    if (fields.status) {
      currentQueue.awayReason = fields.status === 'away' ? holdReason : undefined;
    }
    if (fields.checkedIn && !currentQueue.checkedInAt) {
      currentQueue.checkedInAt = new Date();
    }
    // The consult is on pause: the next call-in starts the clocks and the board call afresh.
    if ((fields.status === 'waiting' || fields.status === 'away') && oldStatus === 'in-progress') {
      currentQueue.startedAt = undefined;
      currentQueue.calledAt = undefined;
    }
    // Remember the visit they already have, so coming back reopens it instead of starting a second one.
    if ((fields.status === 'waiting' || fields.status === 'away') && (oldStatus === 'in-progress' || oldStatus === 'away')) {
      const openVisit = await Visit.findOne(
        tenantFilter(tenantId, { patient: currentQueue.patient, status: 'open', date: { $gte: currentQueue.queuedAt } })
      ).sort({ date: -1 }).select('_id').lean() as { _id: Types.ObjectId } | null;
      if (openVisit) currentQueue.visit = openVisit._id;
    }
    if (fields.status === 'in-progress' && !currentQueue.startedAt) {
      currentQueue.startedAt = new Date();
      currentQueue.calledAt = currentQueue.calledAt || new Date();
    }
    if (fields.status === 'completed' && !currentQueue.completedAt) {
      currentQueue.completedAt = new Date();
    }

    // Everything above decided from oldStatus, so the save only lands if it still holds: of two desks
    // finishing one consult, only one goes on to call the next patient in.
    if (fields.status) currentQueue.$where = { status: oldStatus };
    await currentQueue.save();

    const consultEnded = oldStatus === 'in-progress' && fields.status === 'completed' && _skipAutomation !== true;
    const nextCalled = consultEnded ? await callNextPatient(tenantObjectId, currentQueue.doctor) : null;

    const updatedQueue = await Queue.findOne(tenantFilter(tenantId, { _id: new Types.ObjectId(id) }))
      .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } })
      .lean();

    if (!updatedQueue) return notFoundResponse();

    const newStatus = fields.status;
    if (oldStatus !== newStatus && newStatus && _skipAutomation !== true) {
      after(() =>
        import('@/lib/automations/appointment-from-queue').then(({ updateAppointmentFromQueue }) => {
          return updateAppointmentFromQueue({
            queueId: currentQueue._id,
            patientId: currentQueue.patient,
            appointmentId: currentQueue.appointment,
            newQueueStatus: newStatus,
            tenantId: tenantObjectId,
          }).catch((error) => {
            console.error('[Queue API] Error in appointment automation:', error);
          });
        }).catch((error) => {
          console.error('[Queue API] Error loading appointment automation module:', error);
        })
      );

      // Calling the next patient in updates the line too, so once is enough.
      if (!nextCalled) {
        after(() =>
          import('@/lib/automations/queue-notifications').then(({ notifyQueuePatient }) => {
            return notifyQueuePatient({
              queueId: currentQueue._id,
              tenantId: tenantObjectId,
              newStatus,
            }).catch((error) => {
              console.error('[Queue API] Error sending queue notification:', error);
            });
          }).catch((error) => {
            console.error('[Queue API] Error loading queue-notifications module:', error);
          })
        );
      }
    } else if (fields.doctor !== undefined || fields.priority !== undefined) {
      // Moving someone to another doctor or changing priority reshuffles the lines.
      after(() =>
        import('@/lib/automations/queue-notifications')
          .then(({ notifyQueuePositions }) => notifyQueuePositions(tenantObjectId))
          .catch((error) => console.error('[Queue API] Error sending queue position updates:', error))
      );
    }

    return NextResponse.json({ success: true, data: updatedQueue, nextCalled });
  } catch (error: any) {
    // Lost the race on uniq_tenant_doctor_in_consult: another desk called someone in first.
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'This doctor just started a consult with another patient.' },
        { status: 409 }
      );
    }
    if (error.name === 'DocumentNotFoundError') {
      return NextResponse.json(
        { success: false, error: 'Another desk just updated this patient. Check the queue and try again.' },
        { status: 409 }
      );
    }
    console.error('Error updating queue entry:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid queue entry data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update queue entry' },
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

  const permissionCheck = await requirePermission(ctx.session, 'queue', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return badId();

    const queue = await Queue.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: new Types.ObjectId(id) }),
      { $set: { status: 'cancelled' } },
      { new: true }
    );

    if (!queue) return notFoundResponse();

    import('@/lib/automations/queue-notifications')
      .then(({ notifyQueuePositions }) => notifyQueuePositions(ctx.tenantObjectId))
      .catch((error) => console.error('[Queue API] Error sending queue position updates:', error));

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('Error cancelling queue entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel queue entry' },
      { status: 500 }
    );
  }
}
