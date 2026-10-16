import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processInventoryReordering } from '@/lib/automations/inventory-reordering';

export const maxDuration = 300;

/**
 * Sends each tenant a daily reorder digest.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processInventoryReordering();
    return NextResponse.json({
      success: result.success,
      message: 'Inventory reordering processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] inventory-reordering error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process inventory-reordering' }, { status: 500 });
  }
}
