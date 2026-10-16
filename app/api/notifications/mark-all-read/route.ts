import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { requireNotificationScope, isNotificationScopeError } from '../_lib/scope';

export async function POST(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();

    const result = await Notification.updateMany(
      { ...scope.ownFilter, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    return NextResponse.json({
      success: true,
      data: { updatedCount: result.modifiedCount },
    });
  } catch (error: any) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}
