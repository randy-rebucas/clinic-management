import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { startInvoiceCheckout } from '@/lib/payments/invoice-pay';

const Body = z.object({ accountId: z.string().min(1).max(40) });

function appOrigin(request: NextRequest): string {
  const o = request.headers.get('origin');
  if (o && o !== 'null') return o;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * POST /api/pay/<token>/checkout { accountId }: start an online payment for what is owed on the
 * invoice, into the clinic's (or doctor's) chosen account. Public: the signed link is the key.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;
  const { token } = await params;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: 'Choose how to pay.' }, { status: 400 });
  try {
    const r = await startInvoiceCheckout(token, body.data.accountId, appOrigin(request));
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, data: { url: r.url } });
  } catch (error) {
    console.error('Pay page checkout failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'The payment page couldn’t be opened. Try again in a few minutes.' }, { status: 502 });
  }
}
