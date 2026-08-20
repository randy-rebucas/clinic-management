import { NextRequest, NextResponse } from 'next/server';
import { processPatientReengagement } from '@/lib/automations/patient-reengagement';
import { getTenantContext } from '@/lib/tenant';

/**
 * Patient Re-engagement Cron Job
 *
 * Identifies patients who have not had a visit or confirmed appointment
 * in the past 6 months and sends a friendly re-engagement message.
 *
 * Schedule: 0 10 * * 1  →  10:00 UTC every Monday = 18:00 PHT Monday.
 * Weekly cadence prevents spamming inactive patients.
 */
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    let tenantId: string | undefined;
    try {
      const tenantContext = await getTenantContext();
      tenantId = tenantContext.tenantId || undefined;
    } catch {
      // single-tenant mode
    }

    const result = await processPatientReengagement(tenantId);

    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Patient re-engagement processed',
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] patient-reengagement error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
