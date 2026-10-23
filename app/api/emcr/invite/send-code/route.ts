import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { maskPhone, phoneRateKey } from '@/app/api/patients/auth/shared';
import { EMCR_OTP_EXPIRY_MINUTES, sendAccountOtp } from '@/lib/emcr/session';
import { readInvite } from '../_shared';

/**
 * POST /api/emcr/invite/send-code
 * Body: { code }
 *
 * Text a sign-in code to the invite's phone (the number staff confirmed; the app never sees it
 * in full). Then POST /api/emcr/invite/redeem with the code from the SMS.
 * → { sentTo: '+63*******4567', expiresInMinutes }
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.auth);
  if (limited) return limited;
  try {
    const read = await readInvite(request);
    if ('response' in read) return read.response;
    const { phone } = read.invite;

    const perPhone = await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone));
    if (perPhone) return perPhone;

    await sendAccountOtp(phone);
    logger.info('eMCR invite code sent', { inviteId: String(read.invite._id), phone: maskPhone(phone) });
    return NextResponse.json({ success: true, sentTo: maskPhone(phone), expiresInMinutes: EMCR_OTP_EXPIRY_MINUTES });
  } catch (error) {
    logger.error('Error in eMCR invite send-code', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to send the code. Please try again.' }, { status: 500 });
  }
}
