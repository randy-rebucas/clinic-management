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
    const { orderId, plan } = body;
    const finalOrderId = orderId;

    if (!finalOrderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Capture PayPal order
    const captureResult = await capturePayPalOrder(finalOrderId);

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

    // Calculate expiration date (30 days from now for monthly subscription)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Update subscription
    tenant.subscription = {
      plan: plan || 'professional',
      status: 'active',
      expiresAt,
    };

    await tenant.save();

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: {
        plan: tenant.subscription.plan,
        status: tenant.subscription.status,
        expiresAt: tenant.subscription.expiresAt,
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
