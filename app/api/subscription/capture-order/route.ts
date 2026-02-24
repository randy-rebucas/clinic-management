import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantId } from '@/lib/tenant';
import { capturePayPalOrder } from '@/lib/paypal';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

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

    // Get tenant ID from subdomain or fall back to session tenantId
    const tenantId = await getTenantId() || session.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { orderId, plan, billingCycle = 'monthly' } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    if (!plan || !['basic', 'professional', 'enterprise'].includes(plan)) {
      return NextResponse.json(
        { error: 'Valid plan is required (basic, professional, enterprise)' },
        { status: 400 }
      );
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return NextResponse.json(
        { error: 'Valid billingCycle is required (monthly, yearly)' },
        { status: 400 }
      );
    }

    // Capture PayPal order
    const captureResult = await capturePayPalOrder(orderId);

    if (!captureResult.success) {
      return NextResponse.json(
        { error: captureResult.error || 'Payment capture failed' },
        { status: 400 }
      );
    }

    // Update tenant subscription
    await connectDB();
    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Calculate expiration and renewal date
    const now = new Date();
    const expiresAt = new Date(now);
    if (billingCycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    // Build payment history entry
    const paymentEntry = {
      transactionId: captureResult.transactionId || orderId,
      orderId,
      amount: captureResult.amount || 0,
      currency: captureResult.currency || 'USD',
      payerEmail: captureResult.payerEmail,
      plan,
      billingCycle,
      status: 'completed' as const,
      paidAt: now,
    };

    // Update subscription fields
    if (!tenant.subscription) {
      tenant.subscription = {} as any;
    }
    tenant.subscription.plan = plan;
    tenant.subscription.status = 'active';
    tenant.subscription.billingCycle = billingCycle;
    tenant.subscription.expiresAt = expiresAt;
    tenant.subscription.renewalAt = expiresAt;
    tenant.subscription.paypalOrderId = orderId;

    if (!tenant.subscription.paymentHistory) {
      tenant.subscription.paymentHistory = [];
    }
    tenant.subscription.paymentHistory.push(paymentEntry);

    await tenant.save();

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: {
        plan: tenant.subscription.plan,
        status: tenant.subscription.status,
        billingCycle: tenant.subscription.billingCycle,
        expiresAt: tenant.subscription.expiresAt,
        renewalAt: tenant.subscription.renewalAt,
      },
      transactionId: captureResult.transactionId,
    });
  } catch (error: any) {
    console.error('Error capturing subscription order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process payment' },
      { status: 500 }
    );
  }
}

