import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';

const VALID_VISIT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

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

    const visits = await MedicalRepresentativeVisit.find({
      tenantId: session.tenantId,
      userId: session.userId,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: visits,
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const clinicName = typeof body.clinicName === 'string' ? body.clinicName.trim() : '';
    const clinicLocation = typeof body.clinicLocation === 'string' ? body.clinicLocation.trim() : '';
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : 'scheduled';
    const durationRaw = typeof body.duration === 'number' ? body.duration : Number(body.duration);
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 60;

    if (!clinicName || !clinicLocation || !purpose || !date || !time) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (clinicName.length > 200 || clinicLocation.length > 300 || purpose.length > 500 || notes.length > 2000) {
      return NextResponse.json({ success: false, error: 'One or more fields exceed maximum length.' }, { status: 400 });
    }

    if (!VALID_VISIT_STATUSES.includes(status as typeof VALID_VISIT_STATUSES[number])) {
      return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date.' }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json({ success: false, error: 'Time must be in HH:mm format.' }, { status: 400 });
    }

    await connectDB();

    const visit = await MedicalRepresentativeVisit.create({
      tenantId: session.tenantId,
      userId: session.userId,
      clinicName,
      clinicLocation,
      purpose,
      date: parsedDate,
      time,
      duration,
      status,
      notes,
    });

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
