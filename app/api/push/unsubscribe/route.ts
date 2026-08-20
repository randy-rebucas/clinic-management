import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { deletePushSubscriptionByEndpoint, listPushSubscriptionsForUser } from '@/lib/data/push-subscription';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { endpoint } = body;

    const run = <T,>(fn: () => T | Promise<T>) =>
      session.tenantId ? runWithTenant(session.tenantId, fn) : runAsSystem(fn);

    if (endpoint) {
      // Remove a specific subscription by endpoint (scoped to this user)
      await run(async () => {
        const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
        if (existing && existing.userId === session.userId) {
          await deletePushSubscriptionByEndpoint(endpoint);
        }
      });
    } else {
      // Remove all subscriptions for this user
      await run(async () => {
        const subs = await listPushSubscriptionsForUser(session.userId);
        await Promise.all(subs.map((s) => deletePushSubscriptionByEndpoint(s.endpoint)));
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Push] Unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove subscription' },
      { status: 500 }
    );
  }
}
