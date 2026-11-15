import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { createPatientRequest, patientContact } from '@/lib/patient-support';

const short = z.string().trim().max(60).optional();

const schema = z.object({
  message: z.string().trim().min(10).max(5000),
  email: z.string().trim().email().max(200).optional(),
  /** Sent by the app so support doesn't have to ask: version, build, platform, OS. */
  context: z.object({ appVersion: short, buildNumber: short, platform: short, osVersion: short }).optional(),
});

/**
 * POST /api/patients/me/support { message, email?, context? } → { data: { reference } }
 * "Contact support" in the eMCR app: goes to the platform team's support queue.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;

  const limited = await applyRateLimit(request, rateLimiters.publicWrite, `patient-support:${session.patientId}`);
  if (limited) return limited;

  try {
    const contact = await patientContact(session.patientId);
    if (!contact) return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });

    const { message, email, context } = parsed.data;
    const firstLine = message.split('\n')[0].slice(0, 80);
    const created = await createPatientRequest({
      patientId: session.patientId,
      contact,
      subject: `eMCR app: ${firstLine}`,
      message,
      category: 'general',
      replyEmail: email,
      context: {
        'App version': context?.appVersion,
        Build: context?.buildNumber,
        Platform: context?.platform,
        OS: context?.osVersion,
      },
    });
    return NextResponse.json({ success: true, data: { reference: created.reference } }, { status: 201 });
  } catch (error) {
    console.error('Patient support request failed:', error);
    return NextResponse.json({ success: false, error: 'Couldn’t send your message. Please try again.' }, { status: 500 });
  }
}
