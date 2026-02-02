import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';

interface VisitData {
  clinicName: string;
  clinicLocation: string;
  purpose: string;
  date: string;
  time: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

/**
 * PUT /api/medical-representatives/visits/[id]
 * Update a visit
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body: VisitData;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    await connectDB();

    const visitId = params.id;

    // Update visit (in-memory for now)
    const updatedVisit = {
      _id: visitId,
      userId: session.userId,
      clinicName: body.clinicName,
      clinicLocation: body.clinicLocation,
      purpose: body.purpose,
      date: body.date,
      time: body.time,
      duration: body.duration || 60,
      status: body.status || 'scheduled',
      notes: body.notes || '',
      updatedAt: new Date().toISOString(),
    };

    console.log('Visit updated:', updatedVisit);

    return NextResponse.json({
      success: true,
      message: 'Visit updated successfully',
      data: updatedVisit,
    });
  } catch (error: any) {
    console.error('Update visit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/visits/[id]
 * Delete a visit
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await connectDB();

    const visitId = params.id;
    console.log('Visit deleted:', visitId);

    return NextResponse.json({
      success: true,
      message: 'Visit deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete visit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
