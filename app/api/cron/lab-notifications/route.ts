import { NextRequest, NextResponse } from 'next/server';
import { sendLabResultNotification } from '@/lib/automations/lab-notifications';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Lab Notifications Batch Cron Job
 *
 * Polls for completed lab results that have not yet had notifications sent,
 * and dispatches SMS, email, and in-app notifications to patients.
 *
 * Runs every 30 minutes (cron: every-30-min).
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
    await connectDB();

    let tenantFilter: Record<string, unknown> = {};
    try {
      const tenantContext = await getTenantContext();
      if (tenantContext.tenantId) {
        tenantFilter = { tenantId: new Types.ObjectId(tenantContext.tenantId as string) };
      }
    } catch {
      // single-tenant mode
    }

    // Find completed / reviewed lab results not yet notified
    const pendingLabResults = await LabResult.find({
      ...tenantFilter,
      status: { $in: ['completed', 'reviewed'] },
      notificationSent: { $ne: true },
    })
      .select('_id')
      .limit(50) // Process at most 50 per run
      .lean();

    const results = { processed: 0, sent: 0, failed: 0, errors: [] as string[] };

    for (const lr of pendingLabResults) {
      results.processed++;
      try {
        const notifResult = await sendLabResultNotification({
          labResultId: lr._id as Types.ObjectId,
        });
        if (notifResult.sent) results.sent++;
      } catch (err: unknown) {
        results.failed++;
        results.errors.push(
          `LabResult ${lr._id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Lab notifications batch processed',
      data: results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] lab-notifications error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
