import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { capturePayPalOrder } from '@/lib/paypal';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PaypalOrder from '@/models/PaypalOrder';
import { Types } from 'mongoose';

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin/owner may capture payments
    if (!['admin', 'owner'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    await connectDB();

    // ── Verify order belongs to this tenant ──────────────────────────────────
    // Atomically claim the order: transition pending → processing.
    // If another request already claimed it (webhook or duplicate client call),
    // findOneAndUpdate returns null and we bail — preventing double-processing.
    const pendingOrder = await PaypalOrder.findOneAndUpdate(
      {
        orderId,
        tenantId: new Types.ObjectId(session.tenantId),
        status: 'pending',
      },
      { $set: { status: 'processing' } },
      { new: true }
    );

    if (!pendingOrder) {
      // Could be: wrong tenant, already processing, already completed, or unknown orderId
      const existing = await PaypalOrder.findOne({ orderId }).lean();
      if (!existing) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if ((existing as any).status === 'completed') {
        return NextResponse.json({ error: 'Order already processed' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Order cannot be processed' }, { status: 409 });
    }

    // ── Capture with PayPal ──────────────────────────────────────────────────
    let captureResult: Awaited<ReturnType<typeof capturePayPalOrder>>;
    try {
      captureResult = await capturePayPalOrder(orderId);
    } catch (err: any) {
      // Roll back the lock so the order can be retried
      await PaypalOrder.findOneAndUpdate({ orderId }, { $set: { status: 'pending' } });
      throw err;
    }

    if (!captureResult.success) {
      await PaypalOrder.findOneAndUpdate({ orderId }, { $set: { status: 'failed' } });
      return NextResponse.json(
        { error: captureResult.error || 'Payment capture failed' },
        { status: 400 }
      );
    }

    // ── Update tenant subscription ───────────────────────────────────────────
    const tenant = await Tenant.findById(pendingOrder.tenantId);
    if (!tenant) {
      await PaypalOrder.findOneAndUpdate({ orderId }, { $set: { status: 'failed' } });
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Calendar-accurate expiration (not fixed 30-day window)
    const now = new Date();
    const expiresAt = new Date(now);
    if (pendingOrder.billingCycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    const paymentEntry = {
      transactionId: captureResult.transactionId || orderId,
      orderId,
      amount: captureResult.amount || pendingOrder.amount,
      currency: captureResult.currency || pendingOrder.currency,
      payerEmail: captureResult.payerEmail,
      plan: pendingOrder.plan,
      billingCycle: pendingOrder.billingCycle,
      status: 'completed' as const,
      paidAt: now,
    };

    if (!tenant.subscription) tenant.subscription = {} as any;
    tenant.subscription.plan = pendingOrder.plan;
    tenant.subscription.status = 'active';
    tenant.subscription.billingCycle = pendingOrder.billingCycle;
    tenant.subscription.expiresAt = expiresAt;
    tenant.subscription.renewalAt = expiresAt;
    tenant.subscription.paypalOrderId = orderId;

    if (!tenant.subscription.paymentHistory) tenant.subscription.paymentHistory = [];
    tenant.subscription.paymentHistory.push(paymentEntry);

    await tenant.save();

    // Mark the pending order record as completed
    await PaypalOrder.findOneAndUpdate({ orderId }, { $set: { status: 'completed' } });

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
