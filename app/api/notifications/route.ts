import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireNotificationScope, isNotificationScopeError } from './_lib/scope';

const NOTIFICATION_TYPES = [
  'appointment',
  'visit',
  'prescription',
  'lab_result',
  'invoice',
  'reminder',
  'system',
  'broadcast',
  'visit_followup_reminder',
  'membership_expiry_reminder',
  'referral_followup_reminder',
  'referral_escalation',
  'patient_reengagement',
] as const;

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

export async function GET(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const read = searchParams.get('read'); // 'true', 'false', or null for all
    const type = searchParams.get('type');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const query: Record<string, unknown> = { ...scope.ownFilter };
    if (read !== null) {
      query.read = read === 'true';
    }
    if (type && (NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments({ ...scope.ownFilter, read: false });

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
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
