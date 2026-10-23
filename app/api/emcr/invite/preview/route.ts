import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { invitePreview } from '@/lib/emcr/invite';
import { readInvite } from '../_shared';

/**
 * POST /api/emcr/invite/preview
 * Body: { code }  (the code, the texted link, or the slip's QR content)
 *
 * What the app shows before texting the sign-in code: the clinic, the people on the invite as
 * "Maria D.", and the masked number the code will go to.
 * → { clinicName, mode: 'self' | 'guardian', people: string[], phoneHint, expiresAt }
 * 404 INVITE_INVALID, 410 INVITE_USED / INVITE_EXPIRED.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.auth);
  if (limited) return limited;
  try {
    const read = await readInvite(request);
    if ('response' in read) return read.response;
    return NextResponse.json({ success: true, ...(await invitePreview(read.invite)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error in eMCR invite preview', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
