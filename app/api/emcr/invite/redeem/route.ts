import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { phoneRateKey } from '@/app/api/patients/auth/shared';
import { accountSessionFields, accountView, consumeAccountOtp, otpFailure } from '@/lib/emcr/session';
import { redeemInvite } from '@/lib/emcr/invite';
import type { EmcrAccountLean } from '@/lib/emcr/account';
import { inviteFailure, readInvite } from '../_shared';

const MESSAGES = {
  record_changed: 'Your clinic changed this record since the invite was made. Ask them for a new invite.',
  self_taken: 'This phone number’s eMCR account already belongs to someone else. Ask your clinic to send the invite to another number.',
} as const;

/**
 * POST /api/emcr/invite/redeem
 * Body: { code, otp }
 *
 * Prove the invite's phone with the SMS code from send-code, then link everything the invite
 * names and sign in. No name or birth-date questions: the clinic vouched for the person.
 * → { account, session } (Bearer fields, as POST /api/emcr/auth/otp/verify)
 * 401 for a wrong code (as otp/verify); 409 RECORD_CHANGED / SELF_TAKEN; 410 INVITE_USED.
 */
export async function POST(request: NextRequest) {
  try {
    const read = await readInvite(request);
    if ('response' in read) return read.response;
    const { invite, body } = read;
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    if (!otp) return NextResponse.json({ success: false, error: 'Enter the 6-digit code from the SMS.' }, { status: 400 });

    const limited = await applyAuthRateLimits(request, phoneRateKey(invite.phone));
    if (limited) return limited;

    const proof = await consumeAccountOtp(invite.phone, otp);
    if (!proof.ok) return otpFailure(proof.reason);

    const result = await redeemInvite(invite, proof.account);
    if (!result.ok) {
      if (result.reason === 'used') return inviteFailure('used');
      return NextResponse.json({ success: false, code: result.reason.toUpperCase(), error: MESSAGES[result.reason] }, { status: 409 });
    }

    await connectDB();
    const account = await EmcrAccount.findById(result.accountId).lean<EmcrAccountLean | null>();
    if (!account) return NextResponse.json({ success: false, error: 'Please try again.' }, { status: 500 });
    const [session, view] = await Promise.all([accountSessionFields(account), accountView(account)]);
    logger.info('eMCR invite redeemed', { inviteId: String(invite._id), accountId: String(account._id), mode: invite.mode });

    return NextResponse.json({ success: true, account: view, session }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error in eMCR invite redeem', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
