import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Survey from '@/models/Survey';
import { applyRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';

/** A survey link works for this long after the visit. */
const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const expired = (visitDate: Date | string | undefined) =>
  !visitDate || Date.now() - new Date(visitDate).getTime() > LINK_TTL_MS;

/**
 * GET /api/feedback/[token]
 * Returns visit metadata for the feedback form (clinic name, doctor name, visit date).
 * Public — no auth required. Token is a secret 48-char hex generated per visit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;
  const { token } = await params;
  if (!token || !/^[a-f0-9]{40,128}$/i.test(token)) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
  }

  try {
    await connectDB();

    const visit = await Visit.findOne({ feedbackToken: token })
      .select('_id date visitType provider tenantId status')
      .populate('provider', 'name firstName lastName')
      .lean() as any;

    if (!visit || expired(visit.date)) {
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
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;
  const { token } = await params;
  if (!token || !/^[a-f0-9]{40,128}$/i.test(token)) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
  }

  try {
    await connectDB();

    const visit = await Visit.findOne({ feedbackToken: token })
      .select('_id tenantId patient date')
      .lean() as any;

    if (!visit || expired(visit.date)) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }

    // Prevent duplicate submissions
    const existing = await Survey.findOne({ visitId: visit._id });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const rating = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : undefined);

    const overallRating = rating(body?.overallRating);
    const doctorRating = rating(body?.doctorRating);
    const staffRating = rating(body?.staffRating);
    const facilityRating = rating(body?.facilityRating);
    const waitTimeRating = rating(body?.waitTimeRating);
    const comments = typeof body?.comments === 'string' ? body.comments.slice(0, 5000) : undefined;
    const wouldRecommend = body?.wouldRecommend;

    if (!overallRating) {
      return NextResponse.json({ success: false, error: 'Overall rating (1–5) is required' }, { status: 400 });
    }

    const ip = getClientIp(request.headers);

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
