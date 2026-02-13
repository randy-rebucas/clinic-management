import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    
    console.log('Vitals Update Request:', {
      queueId: id,
      vitalsData: body.vitals
    });

    if (!body.vitals) {
      return NextResponse.json(
        { success: false, error: 'Vitals data is required' },
        { status: 400 }
      );
    }
    
    // Find the queue entry first
    const queue = await Queue.findById(id);
    
    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    console.log('Current vitals before update:', queue.vitals);

    // Update vitals - Mixed type requires markModified
    queue.vitals = body.vitals;
    queue.markModified('vitals');

    console.log('Vitals set before save:', queue.vitals);

    // Save the document
    await queue.save();

    console.log('Vitals after save:', queue.vitals);

    // Verify by refetching from database with lean() for plain object
    const verifyQueue = await Queue.findById(id).lean() as any;
    console.log('Vitals in database (refetched):', verifyQueue?.vitals);

    console.log('Final result vitals:', verifyQueue?.vitals);

    return NextResponse.json({ 
      success: true, 
      data: verifyQueue,
      message: 'Vital signs recorded successfully'
    });
  } catch (error: any) {
    console.error('Error updating vitals:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update vital signs' },
      { status: 500 }
    );
  }
}
