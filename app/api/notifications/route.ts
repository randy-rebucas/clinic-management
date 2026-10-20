import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { notifyStaff, MAX_STAFF_RECIPIENTS, STAFF_SENDER_ROLES } from '@/lib/notify';
import { createAuditLog } from '@/lib/audit';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireNotificationScope, isNotificationScopeError } from './_lib/scope';
import { GROUP_KEYS, NOTIFICATION_GROUPS, NOTIFICATION_TYPES, groupOf, type NotificationGroup } from '@/lib/notification-kinds';

const LIST_FIELDS = 'type priority title message relatedEntity actionUrl read readAt sender.kind sender.name createdAt';

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

const sendSchema = z
  .object({
    /** Legacy single recipient. */
    user: zObjectId.optional(),
    userIds: z.array(zObjectId).max(MAX_STAFF_RECIPIENTS).optional(),
    roles: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    allStaff: z.boolean().optional(),
    title: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(2000),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
    // In-app links only: a path on this site, never an absolute or protocol-relative URL.
    actionUrl: z.string().max(500).regex(/^\/(?![/\\])/,'actionUrl must be a relative path').optional(),
  })
  .refine((b) => b.user || b.userIds?.length || b.roles?.length || b.allStaff, { message: 'Choose who to notify' });

/**
 * POST /api/notifications — send a notification to colleagues in the clinic: chosen people,
 * everyone in some roles, or all staff. Admins, owners and doctors only. Recipients see who it
 * is from; it is pushed to their devices, and recorded in the audit log.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  if (!STAFF_SENDER_ROLES.includes(session.role)) {
    return refuseAccess(session, 'Only doctors and clinic administrators can send notifications', 'notifications', 'write');
  }

  const parsed = await parseBody(request, sendSchema);
  if (isValidationError(parsed)) return parsed;
  const b = parsed.data;

  try {
    await connectDB();
    const me = await User.findById(session.userId).select('name').lean<{ name?: string } | null>();
    const result = await notifyStaff({
      tenantId,
      audience: { userIds: [...(b.userIds ?? []), ...(b.user ? [b.user] : [])], roles: b.roles, allStaff: b.allStaff },
      type: 'message',
      title: b.title,
      message: b.message,
      priority: b.priority ?? 'normal',
      actionUrl: b.actionUrl,
      sender: { kind: 'staff', userId: session.userId, name: me?.name ?? session.email },
      excludeUserId: session.userId,
    });
    if (!result.recipients) {
      return NextResponse.json({ success: false, error: 'Nobody in the clinic matches those recipients.' }, { status: 400 });
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'create',
      resource: 'notification',
      description: `Sent "${b.title}" to ${result.recipients} staff`,
      metadata: { batchId: result.batchId, allStaff: !!b.allStaff, roles: b.roles ?? [], people: (b.userIds ?? []).length + (b.user ? 1 : 0) },
    });

    return NextResponse.json({ success: true, data: { recipients: result.recipients } }, { status: 201 });
  } catch (error: any) {
    console.error('Error sending notification:', error);
    return NextResponse.json({ success: false, error: 'Failed to send notification' }, { status: 500 });
  }
}
