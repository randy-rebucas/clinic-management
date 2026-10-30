import { NextRequest, NextResponse } from 'next/server';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { applyRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';
import { feedbackExpired, parseFeedbackInput, submitVisitFeedback } from '@/lib/visit-feedback';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../../_lib/owned-record';

/**
 * POST /api/patients/me/visits/[id]/feedback
 * The patient's answer to "How was your visit?" from the app: the same form, validation and
 * one-per-visit rule as the SMS/email link (lib/visit-feedback.ts). Only for a visit of their own
 * (or a managed family member's) that the clinic asked for feedback on, within 30 days.
 * Body: { overallRating (1–5, required), doctorRating?, staffRating?, facilityRating?,
 *         waitTimeRating?, comments? (≤2000), wouldRecommend? }
 * → 201 { alreadySubmitted: false } | 200 { alreadySubmitted: true } (a retry is not an error)
 * Errors: 400 invalid body, 404 not their visit / not asked / too old.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Visit');
    if (isOwnedRecordError(ctx)) return ctx;
    const { session } = ctx;

    const limited = await applyRateLimit(request, rateLimiters.api, `patient-feedback:${session.guardianId ?? session.patientId}`);
    if (limited) return limited;

    const visit = await Visit.findOne({ ...ctx.filter, feedbackRequested: true })
      .select('_id tenantId patient date')
      .lean<{ _id: unknown; tenantId?: unknown; patient?: unknown; date?: Date } | null>();
    if (!visit || feedbackExpired(visit.date)) return recordNotFound('Visit');

    const parsed = parseFeedbackInput(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    const result = await submitVisitFeedback(visit, parsed.input, { ipAddress: getClientIp(request.headers) });
    if (result === 'duplicate') {
      return NextResponse.json({ success: true, data: { alreadySubmitted: true } });
    }

    await createAuditLog({
      userId: session.guardianId ?? session.patientId,
      userEmail: session.email,
      userRole: 'patient',
      tenantId: visit.tenantId ? String(visit.tenantId) : undefined,
      action: 'create',
      resource: 'visit',
      resourceId: String(visit._id),
      dataSubject: visit.patient as any,
      description: `Patient gave visit feedback from the app${session.guardianId ? ' (for a family member)' : ''}: ${parsed.input.overallRating}/5`,
      metadata: { channel: 'app' },
    });

    return NextResponse.json({ success: true, data: { alreadySubmitted: false } }, { status: 201 });
  } catch (error) {
    logger.error('Error submitting patient visit feedback', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to submit feedback' }, { status: 500 });
  }
}
