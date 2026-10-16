import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { requireNotificationScope, isNotificationScopeError } from '../_lib/scope';
import { GROUP_KEYS, NOTIFICATION_GROUPS, type NotificationGroup } from '@/lib/notification-kinds';

/** POST /api/notifications/mark-all-read — every unread one, or only one group's (`{ group }`). */
export async function POST(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  const body = await request.json().catch(() => null);
  const group = body?.group as NotificationGroup | undefined;

  try {
    await connectDB();

    const filter: Record<string, unknown> = { ...scope.ownFilter, read: false };
    if (group && GROUP_KEYS.includes(group)) filter.type = { $in: NOTIFICATION_GROUPS[group].types };

    const result = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
    const unreadCount = await Notification.countDocuments({ ...scope.ownFilter, read: false });

    return NextResponse.json({
      success: true,
      data: { updatedCount: result.modifiedCount, unreadCount },
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}
