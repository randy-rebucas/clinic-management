import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Survey from '@/models/Survey';

/**
 * GET /api/feedback/[token]
 * Returns visit metadata for the feedback form (clinic name, doctor name, visit date).
 * Public — no auth required. Token is a secret 48-char hex generated per visit.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 40) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
  }

  try {
    await connectDB();

    const visit = await Visit.findOne({ feedbackToken: token })
      .select('_id date visitType provider tenantId status')
      .populate('provider', 'name firstName lastName')
      .lean() as any;

    if (!visit) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }

    // Check if already submitted
    const existing = await Survey.findOne({ visitId: visit._id }).lean();

    return NextResponse.json({
      success: true,
      data: {
        visitId: visit._id,
        visitDate: visit.date,
        visitType: visit.visitType,
        providerName: visit.provider
          ? `Dr. ${(visit.provider as any).firstName ?? ''} ${(visit.provider as any).lastName ?? ''}`.trim()
          : null,
        alreadySubmitted: !!existing,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Failed to load survey' }, { status: 500 });
  }
}

/**
 * POST /api/feedback/[token]
 * Submit survey response. Public — token acts as auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 40) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
  }

  try {
    await connectDB();

    const visit = await Visit.findOne({ feedbackToken: token })
      .select('_id tenantId patient')
      .lean() as any;

    if (!visit) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }

    // Prevent duplicate submissions
    const existing = await Survey.findOne({ visitId: visit._id });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }

    const body = await request.json();

    const { overallRating, doctorRating, staffRating, facilityRating, waitTimeRating, comments, wouldRecommend } = body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return NextResponse.json({ success: false, error: 'Overall rating (1–5) is required' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? undefined;

    await Survey.create({
      tenantId: visit.tenantId,
      visitId: visit._id,
      patientId: visit.patient,
      overallRating,
      doctorRating: doctorRating || undefined,
      staffRating: staffRating || undefined,
      facilityRating: facilityRating || undefined,
      waitTimeRating: waitTimeRating || undefined,
      comments: comments?.trim() || undefined,
      wouldRecommend: wouldRecommend !== undefined ? Boolean(wouldRecommend) : undefined,
      submittedAt: new Date(),
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Failed to submit survey' }, { status: 500 });
  }
}
