import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processUnassignedAppointments } from '@/lib/automations/smart-assignment';

export const maxDuration = 300;

/**
 * Assigns doctors to upcoming unassigned appointments for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processUnassignedAppointments();
    return NextResponse.json({
      success: result.success,
      message: 'Smart assignment processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] smart-assignment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process smart-assignment' }, { status: 500 });
  }
}
