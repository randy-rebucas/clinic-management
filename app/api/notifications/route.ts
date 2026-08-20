import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { buildNotificationWhere, countUnreadNotifications, createNotification, listNotifications } from '@/lib/data/notification';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const read = searchParams.get('read'); // 'true', 'false', or null for all
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where = buildNotificationWhere({
      userId: session.userId,
      read: read !== null ? read === 'true' : undefined,
      type: type || undefined,
    });

    const { notifications, unreadCount } = await run(tenantId, async () => ({
      notifications: await listNotifications(where, limit),
      unreadCount: await countUnreadNotifications(session.userId),
    }));

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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can create notifications for other users
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const notification = await run(tenantId, () =>
      createNotification({
        userId: body.user || session.userId,
        type: body.type,
        priority: body.priority,
        title: body.title,
        message: body.message,
        relatedEntityType: body.relatedEntity?.type,
        relatedEntityId: body.relatedEntity?.id,
        actionUrl: body.actionUrl,
        metadata: body.metadata,
        expiresAt: body.expiresAt,
      })
    );

    return NextResponse.json({ success: true, data: notification }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}
