import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function PATCH(
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
    
    // First, get current vitals to merge with new data
    const currentQueue = await Queue.findById(id).lean() as any;
    
    if (!currentQueue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    console.log('Current vitals before update:', currentQueue.vitals);

    // Merge vitals - preserve existing fields and add/update new ones
    const mergedVitals = {
      ...(currentQueue.vitals || {}),
      ...body.vitals
    };

    console.log('Merged vitals to save:', mergedVitals);

    // Update using findOneAndUpdate with $set operator
    const filter = { _id: id };
    const update = { $set: { vitals: mergedVitals } };
    const options = { new: true, lean: true }; // Returns the updated document as plain object

    const updatedDoc = await Queue.findOneAndUpdate(filter, update, options);
    
    console.log('Queue Update Result:', {
      updateSuccess: !!updatedDoc,
      hasVitals: !!updatedDoc?.vitals,
      vitals: updatedDoc?.vitals,
      vitalsKeys: updatedDoc?.vitals ? Object.keys(updatedDoc.vitals) : []
    });

    if (!updatedDoc) {
      return NextResponse.json(
        { success: false, error: 'Failed to update queue' },
        { status: 500 }
      );
    }

    // Verify vitals are in the updated document
    if (!updatedDoc.vitals || Object.keys(updatedDoc.vitals).length === 0) {
      console.error('WARNING: Vitals not found in updated document after save!');
    }

    return NextResponse.json({ 
      success: true, 
      data: updatedDoc,
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
