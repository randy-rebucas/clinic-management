import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processAutoCancellationPolicies } from '@/lib/automations/auto-cancellation-policies';

export const maxDuration = 300;

/**
 * Applies progressive no-show restrictions for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processAutoCancellationPolicies();
    return NextResponse.json({
      success: result.success,
      message: 'Auto-cancellation policies processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] auto-cancellation-policies error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process auto-cancellation-policies' }, { status: 500 });
  }
}
