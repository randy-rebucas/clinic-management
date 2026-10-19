import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import Room from '@/models/Room';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { createQueueEntry } from '@/lib/queue-entry';
import { QUEUE_SORT } from '@/lib/queue-order';
import { dayRangeInTz } from '@/lib/tz';

const QUEUE_STATUSES = ['waiting', 'in-progress', 'completed', 'cancelled', 'no-show'];
const ACTIVE = ['waiting', 'in-progress'];

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    // Models referenced by populate below
    void [Patient, Doctor, Room];

    const searchParams = request.nextUrl.searchParams;
    const doctorId = searchParams.get('doctorId');
    const roomId = searchParams.get('roomId');
    const status = searchParams.get('status') || 'waiting';
    const display = searchParams.get('display') === 'true'; // For TV display
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || (display ? 20 : 100), 1), 500);

    const tz = await getTenantTimezone(tenantId);
    const { start: todayStart } = dayRangeInTz(new Date(), tz);
    const query: any = { tenantId: tenantObjectId };

    if (status === 'all') {
      // The day so far: everyone still active (even if queued before today) plus today's finished entries.
      query.$or = [{ status: { $in: ACTIVE } }, { queuedAt: { $gte: todayStart } }];
    } else {
      query.status = { $in: status.split(',').filter((s) => QUEUE_STATUSES.includes(s)) };
    }

    if (doctorId) {
      if (!isValidId(doctorId)) return NextResponse.json({ success: true, data: [] });
      query.doctor = new Types.ObjectId(doctorId);
    }
    if (roomId) {
      if (!isValidId(roomId)) return NextResponse.json({ success: true, data: [] });
      query.room = new Types.ObjectId(roomId);
    }

    const queues = await Queue.find(query)
      .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } })
      .sort(QUEUE_SORT)
      .limit(limit)
      .lean();

    // Each doctor runs their own line (unassigned patients share one). Position counts the
    // waiting patients ahead in that line; the estimate uses the doctor's average consultation
    // today, else the clinic's default appointment length.
    const [consults, settings] = await Promise.all([
      Queue.aggregate([
        { $match: { tenantId: tenantObjectId, status: 'completed', startedAt: { $gte: todayStart }, completedAt: { $ne: null } } },
        { $group: { _id: '$doctor', avg: { $avg: { $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 60_000] } }, n: { $sum: 1 } } },
      ]),
      getSettings(tenantId).catch(() => null),
    ]);
    const fallback = (settings as { appointmentSettings?: { defaultDuration?: number } } | null)?.appointmentSettings?.defaultDuration || 15;
    const avgByDoctor = new Map<string, number>(
      consults.filter((c: { n: number }) => c.n >= 2).map((c: { _id: unknown; avg: number }) => [String(c._id ?? 'none'), Math.max(5, c.avg)])
    );
    const lineKey = (q: any) => String(q.doctor?._id ?? 'none');
    const busy = new Set(queues.filter((q: any) => q.status === 'in-progress').map(lineKey));
    const seen = new Map<string, number>();

    const data = queues.map((queue: any) => {
      if (queue.status !== 'waiting') return queue;
      const key = lineKey(queue);
      const ahead = seen.get(key) ?? 0;
      seen.set(key, ahead + 1);
      const avg = avgByDoctor.get(key) ?? fallback;
      const minutes = ahead * avg + (busy.has(key) ? avg / 2 : 0);
      return { ...queue, position: ahead + 1, estimatedWaitTime: Math.round(minutes / 5) * 5, consultMinutes: Math.round(avg) };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch queue' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'queue', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const { patientId, appointmentId, visitId, doctorId, roomId, queueType, priority, notes } = body ?? {};

    if (!isValidId(patientId)) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }
    for (const [label, value] of [['appointment', appointmentId], ['visit', visitId], ['doctor', doctorId], ['room', roomId]] as const) {
      if (value && !isValidId(value)) {
        return NextResponse.json({ success: false, error: `Invalid ${label}` }, { status: 400 });
      }
    }
    if (queueType && !['appointment', 'walk-in', 'follow-up'].includes(queueType)) {
      return NextResponse.json({ success: false, error: 'Invalid queue type' }, { status: 400 });
    }

    const patient = await Patient.findOne({ _id: patientId, tenantIds: tenantObjectId })
      .select('_id firstName lastName')
      .lean() as any;
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    const patientName = `${patient.firstName} ${patient.lastName}`;

    if (appointmentId && !(await Appointment.exists({ _id: appointmentId, tenantId: tenantObjectId }))) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }
    // One live queue entry per patient: a second click (or a second desk) must not seat them twice.
    const live = await Queue.findOne({ tenantId: tenantObjectId, patient: patientId, status: { $in: ACTIVE } })
      .select('queueNumber')
      .lean() as { queueNumber?: string } | null;
    if (live) {
      return NextResponse.json(
        { success: false, error: `${patientName} is already in the queue as ${live.queueNumber ?? 'an active entry'}` },
        { status: 409 }
      );
    }
    if (doctorId && !(await Doctor.exists({ _id: doctorId, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    if (roomId && !(await Room.exists({ _id: roomId, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    const queue = await createQueueEntry({
      tenantId: tenantObjectId,
      patient,
      queueType: queueType || 'appointment',
      appointmentId,
      visitId,
      doctorId,
      roomId,
      priority: Number.isFinite(Number(priority)) ? Math.min(2, Math.max(0, Math.round(Number(priority)))) : 0,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 500) : undefined,
    });

    await queue.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await queue.populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } });
    await queue.populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } });

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'system',
      resourceId: queue._id,
      description: `Added patient to queue: ${queue.queueNumber}`,
    });

    const settings = await getSettings(tenantId);
    if (settings?.automationSettings?.autoQueueOptimization) {
      const { autoOptimizeQueueOnJoin } = await import('@/lib/automations/queue-optimization');
      autoOptimizeQueueOnJoin(queue._id, tenantId).catch(console.error);
    }
    import('@/lib/automations/queue-notifications')
      .then(({ notifyQueuePositions }) => notifyQueuePositions(tenantObjectId))
      .catch((error) => console.error('[Queue API] Error sending queue position updates:', error));

    return NextResponse.json({ success: true, data: queue }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating queue entry:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid queue entry data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create queue entry' },
      { status: 500 }
    );
  }
}
