import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { startVoucherPurchase } from '@/lib/emcr/voucher-purchase';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/emcr/vouchers/checkout (public, the /voucher page)
 * Body: { email }  (where the activation code is sent once paid)
 * → { checkoutUrl } to send the buyer to PayMongo. 5 per hour per device.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.publicWrite);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address so we can send you the code.' }, { status: 400 });
  }

  try {
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || request.nextUrl.protocol.replace(':', '');
    const origin = host ? `${proto}://${host}` : request.nextUrl.origin;
    const r = await startVoucherPurchase(email, origin);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, checkoutUrl: r.checkoutUrl });
  } catch (error) {
    logger.error('Error starting an eMCR voucher checkout', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t start the payment. Please try again.' }, { status: 502 });
  }
}
