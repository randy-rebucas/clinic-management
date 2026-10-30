import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { runFrontDeskCatchUp } from '@/lib/automations/front-desk-catchup';

export const maxDuration = 300;

/**
 * Tells each clinic's front desk which visits since yesterday still need an invoice, a payment
 * recorded or medicines handed over, after making any invoice auto-billing missed.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await runFrontDeskCatchUp();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Front desk catch-up processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] front-desk-catchup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process front-desk-catchup' }, { status: 500 });
  }
}
