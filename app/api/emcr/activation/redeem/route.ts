import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { ensureAccountForSession } from '@/lib/emcr/account';
import { activationView, forgetActivationCache, redeemActivationCode } from '@/lib/emcr/activation';

const MESSAGES = {
  invalid: 'That code isn’t valid. Check the code on your voucher and try again.',
  used: 'This voucher has already been used.',
  not_paid: 'This voucher isn’t active yet. Please ask the clinic that sold it to you.',
} as const;

/**
 * POST /api/emcr/activation/redeem (patient sign-in)
 * Body: { code }  (the voucher code; dashes and spaces are ignored)
 *
 * Adds one year of eMCR to the account behind this sign-in (`X-Patient-Profile` is ignored, so a
 * family profile's year is the manager's), counted from the current expiry when one is running.
 * → { activation } or 400 with `code`: INVALID | USED | NOT_PAID. 10 tries per hour per account.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  try {
    const account = await ensureAccountForSession(session);
    if (!account) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const limited = await applyRateLimit(request, rateLimiters.voucherRedeem, `voucher:${account._id}`);
    if (limited) return limited;

    const result = await redeemActivationCode(new Types.ObjectId(String(account._id)), body.code);
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.reason.toUpperCase(), error: MESSAGES[result.reason] }, { status: 400 });
    }
    forgetActivationCache();
    logger.info('eMCR voucher redeemed', { accountId: String(account._id), plan: result.plan });
    return NextResponse.json({
      success: true,
      message: `eMCR is active until ${result.expiresAt.toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })}.`,
      activation: activationView({ activation: { plan: result.plan, expiresAt: result.expiresAt } }),
      soldBy: result.clinicName,
    });
  } catch (error) {
    logger.error('Error redeeming eMCR voucher', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
