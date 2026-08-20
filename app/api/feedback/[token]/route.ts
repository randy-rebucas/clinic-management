import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runAsSystem } from '@/lib/tenant-context';
import { createSurveyResponse, getSurveyResponseByVisitId } from '@/lib/data/survey';

/**
 * GET /api/feedback/[token]
 * Returns visit metadata for the feedback form (clinic name, doctor name, visit date).
 * Public — no auth required. Token is a secret 48-char hex generated per visit.
 *
 * This route is a pre-session, cross-tenant lookup by secret token (like the
 * patient-portal auth routes), so it runs entirely under runAsSystem() —
 * there is no session-derived tenant yet.
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
    const result = await runAsSystem(async () => {
      const visit = await prisma.visit.findFirst({
        where: { feedbackToken: token },
        select: {
          id: true,
          date: true,
          visitType: true,
          status: true,
          tenantId: true,
          provider: { select: { name: true } },
        },
      });

      if (!visit) return null;

      const existing = await getSurveyResponseByVisitId(visit.id);

      return {
        visitId: visit.id,
        visitDate: visit.date,
        visitType: visit.visitType,
        providerName: visit.provider ? visit.provider.name : null,
        alreadySubmitted: !!existing,
      };
    });

    if (!result) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
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
    const body = await request.json();
    const { overallRating, doctorRating, staffRating, facilityRating, waitTimeRating, comments, wouldRecommend } = body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return NextResponse.json({ success: false, error: 'Overall rating (1-5) is required' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? undefined;

    const result = await runAsSystem(async () => {
      const visit = await prisma.visit.findFirst({
        where: { feedbackToken: token },
        select: { id: true, tenantId: true, patientId: true },
      });

      if (!visit) return { status: 404 as const };

      // Prevent duplicate submissions
      const existing = await getSurveyResponseByVisitId(visit.id);
      if (existing) return { status: 409 as const };

      await createSurveyResponse({
        visitId: visit.id,
        patientId: visit.patientId,
        overallRating,
        doctorRating: doctorRating || undefined,
        staffRating: staffRating || undefined,
        facilityRating: facilityRating || undefined,
        waitTimeRating: waitTimeRating || undefined,
        comments: comments?.trim() || undefined,
        wouldRecommend: wouldRecommend !== undefined ? Boolean(wouldRecommend) : undefined,
        ipAddress: ip,
      });

      return { status: 200 as const };
    });

    if (result.status === 404) {
      return NextResponse.json({ success: false, error: 'Survey link not found or expired' }, { status: 404 });
    }
    if (result.status === 409) {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Survey already submitted' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Failed to submit survey' }, { status: 500 });
  }
}
