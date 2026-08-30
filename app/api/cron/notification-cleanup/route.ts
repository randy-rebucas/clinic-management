import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';

/**
 * Notification Cleanup Cron Job
 *
 * - Deletes read notifications older than 30 days.
 * - Deletes unread notifications older than 90 days.
 *
 * Schedule: 0 3 * * *  →  03:00 UTC daily.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    const readCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const unreadCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await Notification.deleteMany({
      $or: [
        { read: true, createdAt: { $lt: readCutoff } },
        { read: false, createdAt: { $lt: unreadCutoff } },
      ],
    });

    return NextResponse.json({
      success: true,
      message: 'Notification cleanup processed',
      data: { deletedCount: result.deletedCount },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] notification-cleanup error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
