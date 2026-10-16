import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { createPayPalOrder } from '@/lib/paypal';
import { SUBSCRIPTION_PACKAGES, SubscriptionPlan } from '@/lib/subscription-packages';
import connectDB from '@/lib/mongodb';
import PaypalOrder from '@/models/PaypalOrder';
import { Types } from 'mongoose';

const VALID_PLANS: SubscriptionPlan[] = ['basic', 'professional', 'enterprise'];

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    // Only admin/owner may manage billing
    if (!['admin', 'owner'].includes(session.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const planName = (typeof body?.plan === 'string' ? body.plan.toLowerCase() : '') as SubscriptionPlan;
    const billingCycle: 'monthly' | 'yearly' = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';

    if (!planName || !VALID_PLANS.includes(planName)) {
      return NextResponse.json(
        { success: false, error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 }
      );
    }

    const pkg = SUBSCRIPTION_PACKAGES[planName];
    const amount = billingCycle === 'yearly'
      ? (pkg.price.yearly ?? pkg.price.monthly * 12)
      : pkg.price.monthly;
    const currency = pkg.price.currency || 'USD';

    // Use the request origin so PayPal redirects back to the correct host (including subdomain)
    const origin =
      request.headers.get('origin') ||
      request.headers.get('referer')?.replace(/\/[^/]*$/, '') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const appUrl = origin.replace(/\/$/, '');

    // Create PayPal order — include billingCycle in the plan label
    const { orderId, approvalUrl } = await createPayPalOrder(
      `${planName}-${billingCycle}`,
      amount,
      currency,
      tenantId,
      appUrl,
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
      { success: false, error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
