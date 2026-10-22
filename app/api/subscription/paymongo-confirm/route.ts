import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import Tenant from '@/models/Tenant';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { retrieveCheckoutSession, paidTotal } from '@/lib/paymongo';
import { applyPaidCheckout } from '@/lib/paymongo-apply';

const fail = (code: 'retry' | 'declined' | 'problem', error: string, status: number) => NextResponse.json({ success: false, code, error }, { status });

/**
 * POST { orderId }: where the return page confirms a PayMongo subscription payment. Reads the
 * checkout from PayMongo (not the browser) and applies it if paid; the webhook does the same, so
 * whichever comes first wins and the other finds it done. Same answer shape as capture-order.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!['admin', 'owner'].includes(ctx.session.role)) return fail('problem', 'Only an administrator can confirm a payment', 403);
  const body = await request.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' && /^pm_[a-f0-9]{24}$/.test(body.orderId) ? body.orderId : null;
  if (!orderId) return fail('problem', 'Order ID is required', 400);

  try {
    await connectDB();
    const order = await SubscriptionOrder.findOne({ orderId, tenantId: ctx.tenantObjectId, provider: 'paymongo' }).lean<any>();
    if (!order?.gatewayId) return fail('problem', 'This payment wasn’t started from this clinic, or it has lapsed', 404);

    const session = await retrieveCheckoutSession(order.gatewayId);
    if (paidTotal(session) <= 0) {
      return session.status === 'expired' ? fail('declined', 'The checkout expired without a payment.', 409) : fail('retry', 'PayMongo hasn’t confirmed the payment yet.', 409);
    }
    const r = await applyPaidCheckout(session);
    if (!r.ok) return r.retry ? fail('retry', 'The payment is still being applied.', 409) : fail('problem', 'The payment came through but couldn’t be applied. Contact support.', 409);

    const tenant = await Tenant.findById(ctx.tenantObjectId).select('subscription').lean<any>();
    const sub = tenant?.subscription ?? {};
    return NextResponse.json({ success: true, subscription: { plan: sub.plan, status: sub.status, billingCycle: sub.billingCycle, expiresAt: sub.expiresAt, renewalAt: sub.renewalAt } });
  } catch (error) {
    console.error('Error confirming PayMongo payment:', error);
    return fail('retry', 'PayMongo didn’t answer in time.', 502);
  }
}
