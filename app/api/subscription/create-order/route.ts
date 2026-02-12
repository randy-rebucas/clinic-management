import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantId } from '@/lib/tenant';
import { createPayPalOrder } from '@/lib/paypal';

const PLAN_PRICES: Record<string, number> = {
  basic: 29,
  professional: 79,
  enterprise: 199,
};

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant ID
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PLAN_PRICES[plan.toLowerCase()]) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    const planName = plan.toLowerCase();
    const amount = PLAN_PRICES[planName];

    // Use the request origin so PayPal redirects back to the correct host (including subdomain)
    const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    // Strip trailing slash
    const appUrl = origin.replace(/\/$/, '');

    // Create PayPal order
    const { orderId, approvalUrl } = await createPayPalOrder(
      planName,
      amount,
      'USD',
      tenantId,
      appUrl
    );

    return NextResponse.json({
      success: true,
      orderId,
      approvalUrl,
    });
  } catch (error: any) {
    console.error('Error creating subscription order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    );
  }
}
