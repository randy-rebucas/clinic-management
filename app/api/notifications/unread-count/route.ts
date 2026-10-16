import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { requireNotificationScope, isNotificationScopeError } from '../_lib/scope';

export async function GET(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();

    const unreadCount = await Notification.countDocuments({ ...scope.ownFilter, read: false });

    return NextResponse.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unread count' },
      { status: 500 }
    );
  }
}
