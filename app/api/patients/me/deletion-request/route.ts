import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { createPatientRequest, deletionView, openDeletionRequest, patientContact } from '@/lib/patient-support';

const schema = z.object({ reason: z.string().trim().max(1000).optional() });

/**
 * GET /api/patients/me/deletion-request → { data: { reference, status, requestedAt } | null }:
 * the signed-in patient's unfinished account-deletion request, if any.
 * Always about the account holder: a family-profile header is refused.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);
  try {
    return NextResponse.json({ success: true, data: await openDeletionRequest(session.patientId) });
  } catch (error) {
    console.error('Deletion request lookup failed:', error);
    return NextResponse.json({ success: false, error: 'Couldn’t check your request. Please try again.' }, { status: 500 });
  }
}

/**
 * POST /api/patients/me/deletion-request { reason? }: ask for the eMCR account to be deleted
 * (App Store 5.1.1(v): deletion starts in the app). A person verifies and completes it, as for the
 * web form; nothing is deleted here. Asking again while one is open returns that one.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;

  const limited = await applyRateLimit(request, rateLimiters.publicWrite, `patient-deletion:${session.patientId}`);
  if (limited) return limited;

  try {
    const existing = await openDeletionRequest(session.patientId);
    if (existing) return NextResponse.json({ success: true, data: existing });

    const contact = await patientContact(session.patientId);
    if (!contact) return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });

    const reason = parsed.data.reason;
    const created = await createPatientRequest({
      patientId: session.patientId,
      contact,
      subject: 'eMCR account deletion request',
      message: `The patient asked, in the eMCR app, for their eMCR account to be deleted.${reason ? `\n\nReason: ${reason}` : ''}`,
      category: 'account',
      kind: 'account-deletion',
    });

    const { createAuditLog } = await import('@/lib/audit');
    after(() =>
      createAuditLog({
        action: 'create',
        resource: 'patient',
        resourceId: session.patientId,
        dataSubject: session.patientId,
        description: `Patient requested eMCR account deletion in the app (${created.reference})`,
        isSensitive: true,
      })
    );

    return NextResponse.json({ success: true, data: deletionView(created) }, { status: 201 });
  } catch (error) {
    console.error('Deletion request failed:', error);
    return NextResponse.json({ success: false, error: 'Couldn’t send your request. Please try again.' }, { status: 500 });
  }
}
