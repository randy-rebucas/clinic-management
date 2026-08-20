import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { capturePayPalOrder } from '@/lib/paypal';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { claimPendingPaypalOrder, getPaypalOrderByOrderId, updatePaypalOrderStatus } from '@/lib/data/paypal-order';
import { getTenantById, activateTenantSubscription } from '@/lib/data/tenant';

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

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantId = session.tenantId;

    // ── Verify order belongs to this tenant ──────────────────────────────────
    // Atomically claim the order: transition pending → processing.
    // If another request already claimed it (webhook or duplicate client call),
    // this returns null and we bail — preventing double-processing.
    const pendingOrder = await runWithTenant(tenantId, () => claimPendingPaypalOrder(orderId, tenantId));

    if (!pendingOrder) {
      // Could be: wrong tenant, already processing, already completed, or unknown orderId
      const existing = await runAsSystem(() => getPaypalOrderByOrderId(orderId));
      if (!existing) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (existing.status === 'completed') {
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
      await runWithTenant(tenantId, () => updatePaypalOrderStatus(orderId, 'pending'));
      throw err;
    }

    if (!captureResult.success) {
      await runWithTenant(tenantId, () => updatePaypalOrderStatus(orderId, 'failed'));
      return NextResponse.json(
        { error: captureResult.error || 'Payment capture failed' },
        { status: 400 }
      );
    }

    // ── Update tenant subscription ───────────────────────────────────────────
    const tenant = await runAsSystem(() => getTenantById(tenantId));
    if (!tenant) {
      await runWithTenant(tenantId, () => updatePaypalOrderStatus(orderId, 'failed'));
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

    const updatedTenant = await runAsSystem(() =>
      activateTenantSubscription({
        tenantId,
        plan: pendingOrder.plan,
        billingCycle: pendingOrder.billingCycle,
        expiresAt,
        renewalAt: expiresAt,
        paypalOrderId: orderId,
        paymentHistory: {
          transactionId: captureResult.transactionId || orderId,
          orderId,
          amount: captureResult.amount || pendingOrder.amount,
          currency: captureResult.currency || pendingOrder.currency,
          payerEmail: captureResult.payerEmail,
          plan: pendingOrder.plan,
          billingCycle: pendingOrder.billingCycle,
          paidAt: now,
        },
      })
    );

    // Mark the pending order record as completed
    await runWithTenant(tenantId, () => updatePaypalOrderStatus(orderId, 'completed'));

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: {
        plan: updatedTenant.subscriptionPlan,
        status: updatedTenant.subscriptionStatus,
        billingCycle: updatedTenant.subscriptionBillingCycle,
        expiresAt: updatedTenant.subscriptionExpiresAt,
        renewalAt: updatedTenant.subscriptionRenewalAt,
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
