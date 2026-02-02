import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';

// Define Visit interface for requests
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
 * GET /api/medical-representatives/visits
 * Get all visits for a medical representative
 */
export async function GET(request: NextRequest) {
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

    // For now, return empty array - visits will be stored in a separate collection
    // This is a placeholder implementation
    return NextResponse.json({
      success: true,
      data: [],
    });
  } catch (error: any) {
    console.error('Get visits error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medical-representatives/visits
 * Create a new visit
 */
export async function POST(request: NextRequest) {
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

    // Validate required fields
    if (!body.clinicName || !body.clinicLocation || !body.purpose || !body.date || !body.time) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await connectDB();

    // Create visit object (in-memory for now - would be saved to DB in production)
    const visit = {
      _id: `visit_${Date.now()}`,
      userId: session.userId,
      clinicName: body.clinicName,
      clinicLocation: body.clinicLocation,
      purpose: body.purpose,
      date: body.date,
      time: body.time,
      duration: body.duration || 60,
      status: body.status || 'scheduled',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('Visit created:', visit);

    return NextResponse.json({
      success: true,
      message: 'Visit created successfully',
      data: visit,
    });
  } catch (error: any) {
    console.error('Create visit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
