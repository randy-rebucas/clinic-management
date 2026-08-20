import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { countUnreadNotifications } from '@/lib/data/notification';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    // Use tenantId from session directly; avoid extra DB lookup via getTenantContext()
    const tenantId = session.tenantId;

    const unreadCount = tenantId
      ? await runWithTenant(tenantId, () => countUnreadNotifications(session.userId))
      : await runAsSystem(() => countUnreadNotifications(session.userId));

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
