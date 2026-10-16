import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';

export const maxDuration = 300;

/**
 * Notification Cleanup Cron Job
 *
 * - Deletes read notifications older than 30 days.
 * - Deletes unread notifications older than 90 days.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

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
  } catch (error) {
    console.error('[Cron] notification-cleanup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to clean up notifications' }, { status: 500 });
  }
}
