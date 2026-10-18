import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';

const VALID_VISIT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

/**
 * GET /api/medical-representatives/visits
 * The rep's visits, newest first.
 * Query params: page (default 1), limit (default 50, max 100),
 *   status? (scheduled | completed | cancelled), from? / to? (ISO dates, inclusive)
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const query: Record<string, unknown> = { ...rep.ownerFilter };
    const status = searchParams.get('status');
    if (status) {
      if (!VALID_VISIT_STATUSES.includes(status as typeof VALID_VISIT_STATUSES[number])) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }
    const dateRange: Record<string, Date> = {};
    for (const [param, op] of [['from', '$gte'], ['to', '$lte']] as const) {
      const value = searchParams.get(param);
      if (!value) continue;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ success: false, error: `Invalid ${param} date.` }, { status: 400 });
      }
      dateRange[op] = parsed;
    }
    if (Object.keys(dateRange).length) query.date = dateRange;

    await connectDB();

    const [visits, total] = await Promise.all([
      MedicalRepresentativeVisit.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MedicalRepresentativeVisit.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: visits,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Get visits error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
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
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

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
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(Math.floor(durationRaw), 24 * 60) : 60;

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
      ...rep.ownerFilter,
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
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
