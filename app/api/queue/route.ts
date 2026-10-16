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
import { nextQueueNumber } from '@/lib/queue-number';

const QUEUE_STATUSES = ['waiting', 'in-progress', 'completed', 'cancelled', 'no-show'];

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

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

    const query: any = { tenantId: tenantObjectId };

    // Handle status filter - support comma-separated values
    if (status && status !== 'all') {
      query.status = { $in: status.split(',').filter((s) => QUEUE_STATUSES.includes(s)) };
    } else {
      query.status = { $in: ['waiting', 'in-progress'] };
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
      .sort({ priority: 1, queuedAt: 1 }) // Priority first, then by time
      .limit(display ? 20 : 100)
      .lean();

    const queuesWithWaitTime = queues.map((queue: any, index: number) => ({
      ...queue,
      estimatedWaitTime: index * 15, // 15 minutes per patient (adjustable)
      position: index + 1,
    }));

    return NextResponse.json({
      success: true,
      data: queuesWithWaitTime,
    });
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
    const { patientId, appointmentId, visitId, doctorId, roomId, queueType, priority } = body ?? {};

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
      .select('firstName lastName')
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
    if (doctorId && !(await Doctor.exists({ _id: doctorId, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    if (roomId && !(await Room.exists({ _id: roomId, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    const finalQueueType = queueType || 'appointment';
    const tz = await getTenantTimezone(tenantId);
    const queueNumber = await nextQueueNumber(tenantId, finalQueueType, tz);

    const queue = await Queue.create({
      tenantId: tenantObjectId,
      queueNumber,
      patient: patientId,
      patientName,
      appointment: appointmentId || undefined,
      visit: visitId || undefined,
      doctor: doctorId || undefined,
      room: roomId || undefined,
      queueType: finalQueueType,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      checkedIn: false,
      status: 'waiting',
    });

    // QR code for check-in (needs the queue id)
    queue.qrCode = JSON.stringify({
      queueId: queue._id.toString(),
      patientId,
      appointmentId: appointmentId || null,
      timestamp: Date.now(),
    });
    await queue.save();

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
