import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { deleteNotification, getNotificationRaw, toNotificationDTO, updateNotification } from '@/lib/data/notification';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const notification = await run(tenantId, () => getNotificationRaw(id));

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Users can only view their own notifications (unless admin)
    if (notification.userId !== session.userId && session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: toNotificationDTO(notification) });
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const updatedNotification = await run(tenantId, async () => {
      const notification = await getNotificationRaw(id);
      if (!notification) {
        return { status: 404 as const };
      }

      // Users can only update their own notifications (unless admin)
      if (notification.userId !== session.userId && session.role !== 'admin') {
        return { status: 403 as const };
      }

      // If marking as read, set readAt timestamp
      if (body.read === true && !notification.read) {
        body.readAt = new Date();
      } else if (body.read === false) {
        body.readAt = null;
      }

      const { user, relatedEntity, ...rest } = body;
      const data: any = { ...rest };
      if (relatedEntity) {
        data.relatedEntityType = relatedEntity.type;
        data.relatedEntityId = relatedEntity.id;
      }

      return { status: 200 as const, data: await updateNotification(id, data) };
    });

    if (updatedNotification.status === 404) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (updatedNotification.status === 403) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: updatedNotification.data });
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await run(tenantId, async () => {
      const notification = await getNotificationRaw(id);
      if (!notification) {
        return { status: 404 as const };
      }

      // Users can only delete their own notifications (unless admin)
      if (notification.userId !== session.userId && session.role !== 'admin') {
        return { status: 403 as const };
      }

      await deleteNotification(id);
      return { status: 200 as const };
    });

    if (result.status === 404) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (result.status === 403) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
