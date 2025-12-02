import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Room from '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

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
    const queue = await Queue.findById(id)
      .populate('patient', 'firstName lastName patientCode')
      .populate('doctor', 'firstName lastName')
      .populate('room', 'name roomNumber')
      .populate('appointment', 'appointmentCode appointmentDate appointmentTime');

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

    // Update status timestamps
    if (body.status === 'in-progress' && !body.startedAt) {
      body.startedAt = new Date();
      body.calledAt = body.calledAt || new Date();
    }
    if (body.status === 'completed' && !body.completedAt) {
      body.completedAt = new Date();
    }

    const queue = await Queue.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('doctor', 'firstName lastName')
      .populate('room', 'name roomNumber');

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: queue });
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

    const queue = await Queue.findByIdAndUpdate(
      id,
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

