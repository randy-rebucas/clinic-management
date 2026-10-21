import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';
import { applyAuthRateLimits, applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { FAMILY_RELATIONSHIPS } from '@/lib/patient-family';
import { claimProfile, readClaimToken } from '@/lib/emcr/claim';
import { accountSessionFields, accountView } from '@/lib/emcr/session';
import type { EmcrAccountLean } from '@/lib/emcr/account';

const ClaimSchema = z
  .object({
    claimToken: z.string().min(1).max(1000),
    relation: z.enum(['self', 'other']),
    firstName: z.string().trim().min(1).max(100),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
  })
  .strict();

const MESSAGES: Record<string, string> = {
  no_match: 'We couldn’t find a record on this number with that first name and birth date. Check the spelling and date, or ask your clinic.',
  ambiguous: 'More than one record matches. Please ask your clinic to help you sign in.',
  self_taken: 'This account already has its own record. To add a family member, choose “Someone else”.',
};

/**
 * POST /api/emcr/auth/claim
 * Body: { claimToken, relation: 'self' | 'other', firstName, dateOfBirth: 'YYYY-MM-DD', relationship? }
 *
 * "Is this your record?" after the phone OTP (`claimToken` from POST /api/emcr/auth/otp/verify).
 * `self`: the caller's own record. `other`: someone they look after: a minor is added at once;
 * an adult needs the clinic's approval (`status: 'pending_approval'`).
 *
 * → { status: 'linked' | 'already_linked' | 'pending_approval', account, session }
 *   `session` (Bearer fields, as otp/verify) once the account has a profile to sign in as.
 * A wrong answer is 400 with `code`: NO_MATCH, AMBIGUOUS, SELF_TAKEN.
 * 5 wrong answers per 15 minutes and 10 per day per account.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const parsed = ClaimSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Please fill in the first name and birth date.' }, { status: 400 });
  const body = parsed.data;

  const proof = readClaimToken(body.claimToken);
  if (!proof) {
    return NextResponse.json(
      { success: false, code: 'CLAIM_EXPIRED', error: 'This step timed out. Please sign in with your phone again.' },
      { status: 401 }
    );
  }

  const rateKey = `emcr-claim:${proof.accountId}`;
  const limited = (await applyAuthRateLimits(request, rateKey)) || (await applyRateLimit(request, rateLimiters.emcrClaimDaily, rateKey));
  if (limited) return limited;

  try {
    const result = await claimProfile({
      accountId: proof.accountId,
      phone: proof.phone,
      relation: body.relation,
      firstName: body.firstName,
      dateOfBirth: body.dateOfBirth,
      relationship: body.relationship,
    });

    if (result.status === 'no_match' || result.status === 'ambiguous' || result.status === 'self_taken') {
      return NextResponse.json({ success: false, code: result.status.toUpperCase(), error: MESSAGES[result.status] }, { status: 400 });
    }

    await connectDB();
    const account = await EmcrAccount.findById(proof.accountId).lean<EmcrAccountLean | null>();
    if (!account) return NextResponse.json({ success: false, code: 'CLAIM_EXPIRED', error: 'Please sign in again.' }, { status: 401 });
    const [session, view] = await Promise.all([accountSessionFields(account), accountView(account)]);
    logger.info('eMCR profile claim', { accountId: proof.accountId, status: result.status, relation: body.relation });

    return NextResponse.json({
      success: true,
      status: result.status,
      ...(result.status === 'pending_approval' ? { clinics: result.clinics } : { profileId: result.patientId }),
      account: view,
      session,
    });
  } catch (error) {
    logger.error('Error in eMCR claim', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
