import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { issueHeldInvoices } from '@/lib/platform-invoice';

export const maxDuration = 300;

/**
 * Subscription sales invoices still waiting (issuer not entered yet, serial range used up, or a
 * crash between payment and issue). Schedule: see vercel.json. Auth: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await issueHeldInvoices();
    return NextResponse.json({ success: true, message: 'Platform invoices processed', data: result });
  } catch (error) {
    console.error('[Cron] platform-invoices error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process platform-invoices' }, { status: 500 });
  }
}
