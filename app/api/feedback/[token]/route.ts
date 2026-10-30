import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { applyRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';
import {
  feedbackExpired as expired,
  feedbackProviderName,
  feedbackSubmitted,
  parseFeedbackInput,
  submitVisitFeedback,
} from '@/lib/visit-feedback';

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
      .populate('provider', 'name')
      .lean() as any;

    if (!visit || expired(visit.date)) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }

    // Check if already submitted
    const existing = await feedbackSubmitted(visit._id);

    return NextResponse.json({
      success: true,
      data: {
        visitId: visit._id,
        visitDate: visit.date,
        visitType: visit.visitType,
        providerName: feedbackProviderName(visit.provider),
        alreadySubmitted: existing,
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

    const parsed = parseFeedbackInput(await request.json().catch(() => ({})));
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    // One response per visit
    const result = await submitVisitFeedback(visit, parsed.input, { ipAddress: getClientIp(request.headers) });
    if (result === 'duplicate') {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to submit survey' }, { status: 500 });
  }
}
