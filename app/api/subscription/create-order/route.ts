import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantId } from '@/lib/tenant';
import { createPayPalOrder } from '@/lib/paypal';
import { SUBSCRIPTION_PACKAGES, SubscriptionPlan } from '@/lib/subscription-packages';

const VALID_PLANS: SubscriptionPlan[] = ['basic', 'professional', 'enterprise'];

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant ID
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const planName = (body.plan as string)?.toLowerCase() as SubscriptionPlan;
    const billingCycle: 'monthly' | 'yearly' = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';

    if (!planName || !VALID_PLANS.includes(planName)) {
      return NextResponse.json(
        { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
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
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    );
  }
}
