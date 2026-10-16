import { NextRequest, NextResponse } from 'next/server';
import { capturePayPalOrder, getPayPalOrder, isValidPayPalOrderId, type PayPalCaptureResult } from '@/lib/paypal';
import connectDB from '@/lib/mongodb';
import PaypalOrder from '@/models/PaypalOrder';
import Tenant from '@/models/Tenant';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { activateSubscriptionFromOrder } from '@/lib/subscription';

// A 'processing' claim older than this is treated as abandoned (crashed request) and may be retried.
const STALE_CLAIM_MS = 2 * 60 * 1000;

function subscriptionPayload(sub: any) {
  return {
    plan: sub?.plan,
    status: sub?.status,
    billingCycle: sub?.billingCycle,
    expiresAt: sub?.expiresAt,
    renewalAt: sub?.renewalAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId } = ctx;

    // Only admin/owner may capture payments
    if (!['admin', 'owner'].includes(session.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const orderId = body?.orderId;
    if (!isValidPayPalOrderId(orderId)) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    await connectDB();

    // Atomically claim the order so concurrent requests don't double-process it.
    const claimed = await PaypalOrder.findOneAndUpdate(
      {
        orderId,
        tenantId: tenantObjectId,
        $or: [
          { status: 'pending' },
          { status: 'processing', updatedAt: { $lt: new Date(Date.now() - STALE_CLAIM_MS) } },
        ],
      },
      { $set: { status: 'processing' } },
      { new: true }
    );

    if (!claimed) {
      const existing = await PaypalOrder.findOne({ orderId, tenantId: tenantObjectId }).lean<any>();
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      if (existing.status === 'completed') {
        // Already applied (by an earlier request or the webhook): report success idempotently.
        const tenant = await Tenant.findOne({
          _id: tenantObjectId,
          'subscription.paymentHistory': { $elemMatch: { orderId, status: 'completed' } },
        }).select('subscription').lean<any>();
        if (tenant) {
          return NextResponse.json({
            success: true,
            message: 'Subscription already activated',
            subscription: subscriptionPayload(tenant.subscription),
          });
        }
      }
      return NextResponse.json({ success: false, error: 'Order is being processed, please retry shortly' }, { status: 409 });
    }

    // ── Capture with PayPal ──────────────────────────────────────────────────
    let capture: PayPalCaptureResult = await capturePayPalOrder(orderId);
    if (!capture.success && (capture.alreadyCaptured || capture.transient)) {
      // The capture may have gone through (timeout / retry): ask PayPal for the real state.
      const order = await getPayPalOrder(orderId);
      if (order.success) capture = order;
    }

    if (!capture.success) {
      // Unknown outcome → release the claim so it can be retried; definite failure → mark failed.
      await PaypalOrder.updateOne(
        { orderId },
        { $set: { status: capture.transient ? 'pending' : 'failed' } }
      );
      return NextResponse.json(
        { success: false, error: capture.transient ? 'Payment provider unavailable, please retry' : 'Payment capture failed' },
        { status: capture.transient ? 502 : 400 }
      );
    }

    // ── Update tenant subscription (idempotent per order) ───────────────────
    let result;
    try {
      result = await activateSubscriptionFromOrder(orderId, capture);
    } catch (err) {
      // Money is captured; leave the claim to go stale so a retry or the webhook can finish activation.
      console.error(`Activation failed after capture for order ${orderId}:`, err);
      return NextResponse.json(
        { success: false, error: 'Payment received but activation is delayed. Please retry in a few minutes.' },
        { status: 503 }
      );
    }

    if (!result.ok) {
      console.error(`Activation rejected for order ${orderId}: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: subscriptionPayload(result.subscription),
      transactionId: capture.transactionId,
    });
  } catch (error: any) {
    console.error('Error capturing subscription order:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
