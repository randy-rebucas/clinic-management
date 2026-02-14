import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Room from '@/models/Room';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import { emitQueueUpdate } from '@/lib/websocket/emitHelper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read queue
  const permissionCheck = await requirePermission(session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Ensure models are registered
    await Promise.all([
      import('@/models/Doctor'),
      import('@/models/Patient'),
      import('@/models/Room'),
      import('@/models/Appointment'),
    ]);
    
    const { id } = await params;

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      console.error('[GET /api/queue/[id]] Invalid ObjectId:', id);
      return NextResponse.json(
        { success: false, error: 'Invalid queue ID' },
        { status: 400 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Build query with tenant filter
    const query: any = { _id: new Types.ObjectId(id) };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.tenantId = { $in: [null, undefined] };
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };

    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
    };

    const queue = await Queue.findOne(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      // .populate('room', 'name roomNumber')
      .populate('appointment', 'appointmentCode appointmentDate appointmentTime')
      .lean() as any;

    //   console.log('[GET /api/queue/[id]] Queue found:', { found: !!queue, id: queue?._id });

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: queue });

  } catch (error: any) {
    console.error('[GET /api/queue/[id]] Error:', error);
    console.error('[GET /api/queue/[id]] Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch queue entry', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update queue
  const permissionCheck = await requirePermission(session, 'queue', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue ID' },
        { status: 400 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Build query with tenant filter
    const query: any = { _id: new Types.ObjectId(id) };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.tenantId = { $in: [null, undefined] };
    }

    // Update status timestamps
    if (body.status === 'in-progress' && !body.startedAt) {
      body.startedAt = new Date();
      body.calledAt = body.calledAt || new Date();
    }
    if (body.status === 'completed' && !body.completedAt) {
      body.completedAt = new Date();
    }

    // First, get the current queue entry to see what we're updating
    const currentQueue = await Queue.findOne(query);

    if (!currentQueue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    // Update fields - explicitly handle vitals for nested object (merge to preserve existing fields)
    if (body.vitals) {
      currentQueue.vitals = {
        ...(currentQueue.vitals || {}),
        ...body.vitals
      };
      currentQueue.markModified('vitals');
    }

    // Update other fields
    Object.keys(body).forEach(key => {
      if (key !== 'vitals') {
        (currentQueue as any)[key] = body[key];
      }
    });

    // Save the updated document
    await currentQueue.save();

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };

    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
    };

    // Refetch with lean() to get plain object with vitals preserved
    const updatedQueue = await Queue.findOne({ _id: new Types.ObjectId(id) })
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .populate('room', 'name roomNumber')
      .lean();

    if (!updatedQueue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found after update' },
        { status: 404 }
      );
    }

    // Trigger appointment status update automation if status changed
    const oldStatus = currentQueue.status;
    const newStatus = body.status;
    const skipAutomation = body._skipAutomation === true;
    
    if (oldStatus !== newStatus && newStatus && !skipAutomation) {
      // Import and trigger appointment update automation (async, don't wait)
      import('@/lib/automations/appointment-from-queue').then(({ updateAppointmentFromQueue }) => {
        updateAppointmentFromQueue({
          queueId: currentQueue._id,
          patientId: currentQueue.patient,
          appointmentId: currentQueue.appointment,
          newQueueStatus: newStatus,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
        }).catch((error) => {
          console.error('[Queue API] Error in appointment automation:', error);
          // Don't fail queue update if appointment update fails
        });
      }).catch((error) => {
        console.error('[Queue API] Error loading appointment automation module:', error);
      });
    }

    // Emit WebSocket event for real-time updates
    emitQueueUpdate(updatedQueue, { tenantId: tenantId || undefined });

    return NextResponse.json({ success: true, data: updatedQueue });
  } catch (error: any) {
    console.error('Error updating queue entry:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete queue entries
  const permissionCheck = await requirePermission(session, 'queue', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue ID' },
        { status: 400 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Build query with tenant filter
    const query: any = { _id: new Types.ObjectId(id) };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.tenantId = { $in: [null, undefined] };
    }

    const queue = await Queue.findOneAndUpdate(
      query,
      { status: 'cancelled' },
      { new: true }
    );

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('Error cancelling queue entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel queue entry', details: error.message },
      { status: 500 }
    );
  }
}

