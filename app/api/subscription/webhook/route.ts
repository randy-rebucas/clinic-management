import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PaypalOrder from '@/models/PaypalOrder';
import { verifyPayPalWebhook } from '@/lib/paypal';
import { activateSubscriptionFromOrder } from '@/lib/subscription';

/**
 * PayPal webhook handler for subscription events
 * Handles PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const headers: Record<string, string> = Object.fromEntries(
      Array.from(request.headers.entries()).map(([key, value]) => [key.toLowerCase(), value])
    );

    // Verify webhook signature using PayPal's API
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      if (process.env.NODE_ENV === 'production') {
        console.error('PAYPAL_WEBHOOK_ID not configured — rejecting webhook in production');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
      }
      console.warn('PAYPAL_WEBHOOK_ID not configured — skipping signature verification (dev only)');
    } else {
      const isValid = await verifyPayPalWebhook(headers, rawBody, webhookId);
      if (!isValid) {
        console.warn('Invalid PayPal webhook signature — rejecting request');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const eventType = body.event_type;
    const resource = body.resource;
    // PayPal's unique transmission ID — use as idempotency key
    const transmissionId = headers['paypal-transmission-id'] as string | undefined;

    await connectDB();

    // ── Idempotency: skip events already processed ───────────────────────────
    if (transmissionId) {
      const alreadyProcessed = await Tenant.exists({
        'subscription.processedWebhookIds': transmissionId,
      });
      if (alreadyProcessed) {
        console.log(`Webhook ${transmissionId} already processed — skipping`);
        return NextResponse.json({ received: true });
      }
    }

    let tenantIdForStamp: unknown;

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // resource is the capture object
        const orderId: string | undefined = resource?.supplementary_data?.related_ids?.order_id;
        if (!orderId) {
          console.warn('PAYMENT.CAPTURE.COMPLETED: no orderId found in webhook payload');
          break;
        }

        const result = await activateSubscriptionFromOrder(orderId, {
          transactionId: resource?.id,
          amount: resource?.amount?.value != null ? parseFloat(resource.amount.value) : undefined,
          currency: resource?.amount?.currency_code,
        });
        if (!result.ok) {
          console.warn(`PAYMENT.CAPTURE.COMPLETED: order ${orderId} not applied: ${result.error}`);
          // 409 = transient contention; let PayPal redeliver.
          if (result.status === 409) {
            return NextResponse.json({ error: 'Retry later' }, { status: 503 });
          }
          break;
        }
        tenantIdForStamp = (await PaypalOrder.findOne({ orderId }).select('tenantId').lean<any>())?.tenantId;
        console.log(`PAYMENT.CAPTURE.COMPLETED: order ${orderId} ${result.alreadyApplied ? 'already applied' : 'activated'}`);
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        // resource is the refund object; its `up` link points at the refunded capture.
        const upHref: string | undefined = resource?.links?.find((l: any) => l.rel === 'up')?.href;
        const captureId = upHref?.match(/\/captures\/([^/?#]+)/)?.[1];
        const relatedOrderId: string | undefined = resource?.supplementary_data?.related_ids?.order_id;

        if (!captureId && !relatedOrderId) {
          console.warn('PAYMENT.CAPTURE.REFUNDED: no capture/order id found in webhook payload');
          break;
        }

        const tenant = await Tenant.findOne(
          captureId
            ? { 'subscription.paymentHistory.transactionId': captureId }
            : { 'subscription.paymentHistory.orderId': relatedOrderId }
        );
        if (!tenant || !tenant.subscription) {
          console.warn(`PAYMENT.CAPTURE.REFUNDED: no tenant found for capture ${captureId || relatedOrderId}`);
          break;
        }
        tenantIdForStamp = tenant._id;

        const payment = tenant.subscription.paymentHistory?.find((p: any) =>
          captureId ? p.transactionId === captureId : p.orderId === relatedOrderId
        );
        if (!payment) break;

        const refunded = parseFloat(
          resource?.seller_payable_breakdown?.total_refunded_amount?.value ??
          resource?.amount?.value ??
          '0'
        );
        const isFullRefund = refunded + 0.005 >= Number(payment.amount);
        if (!isFullRefund) {
          console.log(`PAYMENT.CAPTURE.REFUNDED: partial refund (${refunded}/${payment.amount}) for tenant ${tenant._id} — subscription unchanged`);
          break;
        }

        payment.status = 'refunded';
        // Only a full refund of the payment that funds the current period cancels the subscription.
        if (payment.orderId === tenant.subscription.paypalOrderId) {
          tenant.subscription.status = 'cancelled';
        }
        await tenant.save();
        console.log(`PAYMENT.CAPTURE.REFUNDED: payment ${payment.transactionId} refunded for tenant ${tenant._id}`);
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        const deniedOrderId = resource?.supplementary_data?.related_ids?.order_id;
        if (deniedOrderId) {
          const tenant = await Tenant.findOne({
            'subscription.paypalOrderId': deniedOrderId,
          });
          if (tenant) tenantIdForStamp = tenant._id;
          if (tenant && tenant.subscription?.status === 'active') {
            tenant.subscription.status = 'cancelled';
            await tenant.save();
            console.log(`PAYMENT.CAPTURE.DENIED: subscription deactivated for tenant ${tenant._id}`);
          }
        }
        break;
      }

      default:
        // Acknowledge unhandled event types without error
        break;
    }

    if (transmissionId && tenantIdForStamp) {
      await Tenant.updateOne(
        { _id: tenantIdForStamp },
        { $push: { 'subscription.processedWebhookIds': { $each: [transmissionId], $slice: -50 } } }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing PayPal webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

