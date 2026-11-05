import { NextRequest, NextResponse, after } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { maskPhone } from '@/lib/phone';
import { readSmsOptOutToken } from '@/lib/sms-opt-out-link';
import { setSmsPreference } from '@/lib/sms-preferences';

/**
 * POST /api/public/sms-opt-out  { token }
 * Stop texts from one clinic to the number in the link. A POST on purpose: link scanners open the
 * page in a text, and that must not unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const link = readSmsOptOutToken(body?.token);
  if (!link) return NextResponse.json({ success: false, error: 'This link doesn’t work any more.' }, { status: 400 });

  try {
    await setSmsPreference({ phone: link.phone, tenantId: link.tenantId, optedOut: true, source: 'link' });
    const { createAuditLog } = await import('@/lib/audit');
    after(() =>
      createAuditLog({
        tenantId: link.tenantId,
        action: 'update',
        resource: 'notification',
        description: `Text messages stopped from an opt-out link, for ${maskPhone(link.phone)}`,
      })
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error saving SMS opt-out', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
