import { NextRequest, NextResponse } from 'next/server';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { getPlanPricing } from '@/lib/platform-config';
import { randomBytes } from 'crypto';
import { PAID_PLANS, isPaidPlan, planPrice, planLabel } from '@/lib/subscription-period';
import connectDB from '@/lib/mongodb';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import { Types } from 'mongoose';

/** The site this request came from, so PayMongo sends the payer back to the same clinic host. */
function appOrigin(request: NextRequest): string {
  for (const value of [request.headers.get('origin'), request.headers.get('referer')]) {
    if (!value || value === 'null') continue;
    try {
      return new URL(value).origin;
    } catch {
      // try the next one
    }
  }
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    // Only admin/owner may manage billing
    if (!['admin', 'owner'].includes(session.role)) {
      return refuseAccess(session, 'Forbidden', 'subscription', 'write');
    }

    if (!(await isPayMongoConfigured())) {
      return NextResponse.json(
        { success: false, error: 'Online payment isn’t set up on this server, so no payment was started.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const planName = typeof body?.plan === 'string' ? body.plan.toLowerCase() : '';
    const billingCycle: 'monthly' | 'yearly' = body?.billingCycle === 'yearly' ? 'yearly' : 'monthly';

    if (!isPaidPlan(planName)) {
      return NextResponse.json(
        { success: false, error: `Invalid plan. Must be one of: ${PAID_PLANS.join(', ')}` },
        { status: 400 }
      );
    }

    const { amount, currency } = planPrice(planName, billingCycle, await getPlanPricing());

    // Our own reference is the order id; PayMongo's session id is kept beside it.
    const orderId = `pm_${randomBytes(12).toString('hex')}`;
    const origin = appOrigin(request);
    const checkout = await createCheckoutSession({
      name: `MyClinicSoft ${planLabel(planName)}, ${billingCycle}`,
      amount,
      description: `${planLabel(planName)} plan, ${billingCycle === 'yearly' ? 'one year' : 'one month'}`,
      referenceNumber: orderId,
      successUrl: `${origin}/admin/subscription/success?token=${orderId}`,
      cancelUrl: `${origin}/admin/subscription?cancelled=1`,
      email: session.email,
      // Enough to apply the payment even if this order record has lapsed by the time it's paid.
      metadata: { purpose: 'subscription', orderId, tenantId: String(tenantId), plan: planName, billingCycle, amount: String(amount) },
    });
    await connectDB();
    await SubscriptionOrder.create({ orderId, tenantId: new Types.ObjectId(tenantId), plan: planName, billingCycle, amount, currency, provider: 'paymongo', gatewayId: checkout.id });
    return NextResponse.json({ success: true, orderId, approvalUrl: checkout.checkoutUrl, plan: planName, billingCycle, amount, currency, gateway: 'paymongo' });
  } catch (error: any) {
    console.error('Error creating subscription order:', error);
    return NextResponse.json(
      { success: false, error: 'The payment couldn’t be started. Nothing was charged; try again in a few minutes.' },
      { status: 502 }
    );
  }
}
