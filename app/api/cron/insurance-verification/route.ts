import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { verifyInsuranceForUpcomingAppointments } from '@/lib/automations/insurance-verification';

export const maxDuration = 300;

/**
 * Verifies insurance for the next two days' appointments for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await verifyInsuranceForUpcomingAppointments();
    return NextResponse.json({
      success: result.success,
      message: 'Insurance verification processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] insurance-verification error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process insurance-verification' }, { status: 500 });
  }
}
