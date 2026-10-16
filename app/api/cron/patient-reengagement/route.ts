import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processPatientReengagement } from '@/lib/automations/patient-reengagement';

export const maxDuration = 300;

/**
 * Weekly outreach to patients inactive for 6+ months (once per 180 days).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processPatientReengagement();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Patient re-engagement processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] patient-reengagement error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process patient-reengagement' }, { status: 500 });
  }
}
