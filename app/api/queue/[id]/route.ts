import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Room from '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: null }] };
    }
    
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const queue = await Queue.findOne(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .populate('room', 'name roomNumber')
      .populate('appointment', 'appointmentCode appointmentDate appointmentTime')
      .lean();

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('Error fetching queue entry:', error);
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
    
    // Log incoming data for debugging
    console.log('Queue Update Request:', {
      queueId: id,
      updateData: body,
      hasVitals: !!body.vitals,
      vitalsData: body.vitals
    });
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
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

    console.log('Current Queue before update:', {
      _id: currentQueue._id,
      currentVitals: currentQueue.vitals,
      incomingVitals: body.vitals
    });

    // Update fields - explicitly handle vitals for nested object (merge to preserve existing fields)
    if (body.vitals) {
      currentQueue.vitals = {
        ...(currentQueue.vitals || {}),
        ...body.vitals
      };
      currentQueue.markModified('vitals');
      console.log('Vitals merged and set:', currentQueue.vitals);
    }

    // Update other fields
    Object.keys(body).forEach(key => {
      if (key !== 'vitals') {
        (currentQueue as any)[key] = body[key];
      }
    });

    // Save the updated document
    await currentQueue.save();

    console.log('Queue After Save:', {
      _id: currentQueue._id,
      vitals: currentQueue.vitals,
      hasVitals: !!currentQueue.vitals,
      vitalsKeys: currentQueue.vitals ? Object.keys(currentQueue.vitals) : []
    });

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: null }] };
    }
    
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    // Refetch with lean() to get plain object with vitals preserved
    const updatedQueue = await Queue.findOne({ _id: id })
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
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
      { success: false, error: 'Failed to cancel queue entry' },
      { status: 500 }
    );
  }
}

