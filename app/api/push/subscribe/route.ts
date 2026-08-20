import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { upsertPushSubscription } from '@/lib/data/push-subscription';

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { endpoint, keys, userAgent } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { success: false, error: 'Invalid subscription payload' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const input = {
      userId: session.userId,
      endpoint,
      keysP256dh: keys.p256dh,
      keysAuth: keys.auth,
      userAgent,
    };

    if (tenantId) {
      await runWithTenant(tenantId, () => upsertPushSubscription(input));
    } else {
      await runAsSystem(() => upsertPushSubscription(input));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Push] Subscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}
