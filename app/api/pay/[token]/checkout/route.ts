import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { startInvoiceCheckout } from '@/lib/payments/invoice-pay';

const Body = z.object({ accountId: z.string().min(1).max(40) });

/**
 * Where the checkout returns to: the page's own origin when it is this site (a clinic subdomain
 * included), else the app URL. Never an origin the caller names, or a pay link could be turned
 * into a genuine checkout that lands on someone else's site.
 */
function appOrigin(request: NextRequest): string {
  const fallback = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const o = request.headers.get('origin');
  if (!o || o === 'null') return fallback;
  try {
    const host = new URL(o).hostname.toLowerCase();
    const root = process.env.ROOT_DOMAIN?.split(':')[0].trim().toLowerCase().replace(/^\./, '');
    const ownHost = request.nextUrl.hostname.toLowerCase();
    if (host === ownHost || (root && (host === root || host.endsWith(`.${root}`)))) return new URL(o).origin;
  } catch {
    // not a URL
  }
  return fallback;
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
