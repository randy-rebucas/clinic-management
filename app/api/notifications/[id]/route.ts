import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireNotificationScope, isNotificationScopeError } from '../_lib/scope';

// Recipients may only toggle the read state of their own notifications.
const updateNotificationSchema = z.object({ read: z.boolean() });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Notification');

    const notification = await Notification.findOne({ ...scope.ownFilter, _id: id });
    if (!notification) return notFound('Notification');

    return NextResponse.json({ success: true, data: notification });
  } catch (error: any) {
    console.error('Error fetching notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notification' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Notification');

    const parsed = await parseBody(request, updateNotificationSchema);
    if (isValidationError(parsed)) return parsed;
    const { read } = parsed.data;

    const query = { ...scope.ownFilter, _id: id };
    const notification = await Notification.findOne(query);
    if (!notification) return notFound('Notification');

    const update = read
      ? { $set: { read: true, readAt: notification.read ? notification.readAt : new Date() } }
      : { $set: { read: false }, $unset: { readAt: 1 } };

    const updatedNotification = await Notification.findOneAndUpdate(query, update, {
      new: true,
      runValidators: true,
    });

    return NextResponse.json({ success: true, data: updatedNotification });
  } catch (error: any) {
    console.error('Error updating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Notification');

    const deleted = await Notification.findOneAndDelete({ ...scope.ownFilter, _id: id });
    if (!deleted) return notFound('Notification');

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
