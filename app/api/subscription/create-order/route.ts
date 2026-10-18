import { NextRequest, NextResponse } from 'next/server';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { createPayPalOrder, isPayPalConfigured } from '@/lib/paypal';
import { PAID_PLANS, isPaidPlan, planPrice } from '@/lib/subscription-period';
import connectDB from '@/lib/mongodb';
import PaypalOrder from '@/models/PaypalOrder';
import { Types } from 'mongoose';

/** The site this request came from, so PayPal sends the payer back to the same clinic host. */
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

    if (!isPayPalConfigured()) {
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

    const { amount, currency } = planPrice(planName, billingCycle);

    // Create PayPal order — include billingCycle in the plan label
    const { orderId, approvalUrl } = await createPayPalOrder(
      `${planName}-${billingCycle}`,
      amount,
      currency,
      tenantId,
      appOrigin(request),
      billingCycle,
    );

    // Persist the order → tenant binding so capture-order can verify ownership
    // and read plan/billingCycle from DB (not from client body)
    await connectDB();
    await PaypalOrder.create({
      orderId,
      tenantId: new Types.ObjectId(tenantId),
      plan: planName,
      billingCycle,
      amount,
      currency,
    });

    return NextResponse.json({
      success: true,
      orderId,
      approvalUrl,
      plan: planName,
      billingCycle,
      amount,
      currency,
    });
  } catch (error: any) {
    console.error('Error creating subscription order:', error);
    return NextResponse.json(
      { success: false, error: 'PayPal couldn’t start the payment. Nothing was charged; try again in a few minutes.' },
      { status: 502 }
    );
  }
}
