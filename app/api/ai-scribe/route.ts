import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Prescription from '@/models/Prescription';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { draftVisitNote, scribeConfigured, ScribeError } from '@/lib/ai-scribe';
import { MAX_TRANSCRIPT_CHARS, type ScribeContext } from '@/lib/ai-scribe-schema';

// One Claude call plus ICD-10 lookups; a long consult can take a while.
export const maxDuration = 120;

const Input = z.object({
  transcript: z.string().trim().min(20, 'Dictate or type a bit more of the consult first.').max(MAX_TRANSCRIPT_CHARS, 'The transcript is too long. Shorten it and try again.'),
  patientId: zObjectId.optional(),
  visitType: z.string().trim().max(40).optional(),
});

const LIMIT = { name: 'ai-scribe', windowMs: 60 * 60 * 1000, maxRequests: 40, identifierOnly: true, message: 'You have used the AI scribe a lot this hour. Try again later.' };

/** GET /api/ai-scribe → whether the scribe can be offered to this clinic. */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const plan = await checkSubscriptionLimit(ctx.tenantId, 'useFeature', 'aiScribe');
  return NextResponse.json({
    success: true,
    data: { available: plan.allowed && scribeConfigured(), configured: scribeConfigured(), planAllows: plan.allowed },
  });
}

/**
 * POST /api/ai-scribe  Body: { transcript, patientId?, visitType? }
 * Returns a draft note for the doctor to review. Nothing is saved, and the transcript
 * is not stored or logged.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  const denied = await requirePermission(session, 'visits', 'write');
  if (denied) return denied;

  const plan = await checkSubscriptionLimit(tenantId, 'useFeature', 'aiScribe');
  if (!plan.allowed) {
    return NextResponse.json({ success: false, error: 'The AI scribe is part of the Professional and Enterprise plans.' }, { status: 403 });
  }

  const limited = await consumeRateLimit(LIMIT, getClientIp(request.headers), session.userId);
  if (!limited.allowed) return NextResponse.json({ success: false, error: LIMIT.message }, { status: 429 });

  const parsed = await parseBody(request, Input);
  if (isValidationError(parsed)) return parsed;
  const { transcript, patientId, visitType } = parsed.data;

  await connectDB();
  const context: ScribeContext = { visitType };
  if (patientId) {
    const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: patientId }))
      .select('dateOfBirth sex allergies')
      .lean<{ dateOfBirth?: Date; sex?: string; allergies?: Array<string | { substance?: string }> } | null>();
    if (!patient) return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    context.ageYears = patient.dateOfBirth ? ageInYears(patient.dateOfBirth) : null;
    context.sex = patient.sex ?? null;
    context.allergies = (patient.allergies ?? [])
      .map((a) => (typeof a === 'string' ? a : a?.substance ?? ''))
      .map((a) => a.trim())
      .filter(Boolean);
    const active = await Prescription.find({ tenantId, patient: patientId, status: { $in: ['active', 'partially-dispensed'] } })
      .select('medications.name medications.strength')
      .sort({ issuedAt: -1 })
      .limit(3)
      .lean<Array<{ medications?: Array<{ name?: string; strength?: string }> }>>();
    context.currentMedications = [
      ...new Set(active.flatMap((p) => (p.medications ?? []).map((m) => [m.name, m.strength].filter(Boolean).join(' '))).filter(Boolean)),
    ];
  }

  try {
    const result = await draftVisitNote(transcript, context);
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'create',
      resource: 'visit',
      description: 'Drafted a visit note with the AI scribe',
      dataSubject: patientId,
      metadata: { feature: 'ai-scribe', transcriptChars: transcript.length, diagnoses: result.draft.diagnoses.length, medications: result.draft.medications.length },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ScribeError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('AI scribe failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'The AI scribe is unavailable right now. Try again.' }, { status: 502 });
  }
}

function ageInYears(dob: Date): number {
  const d = new Date(dob);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return Math.max(0, years);
}
