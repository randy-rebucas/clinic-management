import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireNotificationScope, isNotificationScopeError } from './_lib/scope';
import { GROUP_KEYS, NOTIFICATION_GROUPS, NOTIFICATION_TYPES, groupOf, type NotificationGroup } from '@/lib/notification-kinds';

const LIST_FIELDS = 'type priority title message relatedEntity actionUrl read readAt createdAt';

const createNotificationSchema = z.object({
  user: zObjectId.optional(),
  type: z.enum(NOTIFICATION_TYPES),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  relatedEntity: z
    .object({
      type: z.enum(['appointment', 'visit', 'prescription', 'lab_result', 'invoice', 'patient']),
      id: zObjectId,
    })
    .optional(),
  // In-app links only: a path on this site, never an absolute or protocol-relative URL.
  actionUrl: z.string().max(500).regex(/^\/(?![/\\])/, 'actionUrl must be a relative path').optional(),
  expiresAt: z.coerce.date().optional(),
});

/**
 * GET /api/notifications — the caller's own notifications, newest first.
 * `read` (true | false), `type` or `group` (see lib/notification-kinds), `limit`, and `before`
 * (an ISO time: the page older than the last one shown). Also returns the unread count, unread
 * counts per group, and whether older ones remain.
 */
export async function GET(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const read = searchParams.get('read'); // 'true', 'false', or null for all
    const type = searchParams.get('type');
    const group = searchParams.get('group') as NotificationGroup | null;
    const before = searchParams.get('before');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const query: Record<string, unknown> = { ...scope.ownFilter };
    if (read !== null) {
      query.read = read === 'true';
    }
    if (type && (NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      query.type = type;
    } else if (group && GROUP_KEYS.includes(group)) {
      query.type = { $in: NOTIFICATION_GROUPS[group].types };
    }
    if (before) {
      const t = new Date(before);
      if (!Number.isNaN(t.getTime())) query.createdAt = { $lt: t };
    }

    const [rows, unreadByType] = await Promise.all([
      Notification.find(query).select(LIST_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
      Notification.aggregate<{ _id: string; n: number }>([{ $match: { ...scope.ownFilter, read: false } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    ]);

    const unreadByGroup: Partial<Record<NotificationGroup, number>> = {};
    let unreadCount = 0;
    for (const r of unreadByType) {
      unreadCount += r.n;
      const g = groupOf(r._id);
      if (g) unreadByGroup[g] = (unreadByGroup[g] ?? 0) + r.n;
    }

    return NextResponse.json({
      success: true,
      data: {
        notifications: rows.slice(0, limit),
        hasMore: rows.length > limit,
        unreadCount,
        unreadByGroup,
      },
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Only admin can create notifications for other users
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createNotificationSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const recipient = body.user || session.userId;
    if (!(await User.exists(tenantFilter(tenantId, { _id: recipient })))) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const notification = await Notification.create({
      ...body,
      user: recipient,
      tenantId: tenantObjectId,
    });

    return NextResponse.json({ success: true, data: notification }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid notification data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}
