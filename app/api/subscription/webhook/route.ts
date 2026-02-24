import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { verifyPayPalWebhook } from '@/lib/paypal';

/**
 * PayPal webhook handler for subscription events
 * Handles PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value])
    );

    // Verify webhook signature using PayPal's API
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (webhookId) {
      const isValid = await verifyPayPalWebhook(headers, rawBody, webhookId);
      if (!isValid) {
        console.warn('Invalid PayPal webhook signature — rejecting request');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('PAYPAL_WEBHOOK_ID not configured — skipping signature verification');
    }

    const eventType = body.event_type;
    const resource = body.resource;

    await connectDB();

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Extract the PayPal order ID from the capture resource
        const orderId =
          resource?.supplementary_data?.related_ids?.order_id ||
          resource?.id;

        if (!orderId) {
          console.warn('PAYMENT.CAPTURE.COMPLETED: no orderId found in webhook payload');
          break;
        }

        // Find the tenant that initiated this payment
        const tenant = await Tenant.findOne({
          $or: [
            { 'subscription.paypalOrderId': orderId },
            { 'subscription.paymentHistory.orderId': orderId },
          ],
        });

        if (!tenant) {
          // Possibly capture-order route hasn't run yet — try to parse tenantId from reference_id
          const referenceId: string | undefined =
            resource?.purchase_units?.[0]?.reference_id ||
            body?.resource?.supplementary_data?.related_ids?.capture_id;
          // reference_id format: subscription-{tenantId}-{timestamp}
          const match = typeof referenceId === 'string'
            ? referenceId.match(/^subscription-(.+)-\d+$/)
            : null;
          if (match) {
            const tenantFromRef = await Tenant.findById(match[1]);
            if (tenantFromRef) {
              console.log(`PAYMENT.CAPTURE.COMPLETED: tenant found via reference_id for order ${orderId}`);
              // capture-order route is the primary activation path; webhook is a safety net
              // Only act if subscription is not yet active for this order
              if (
                tenantFromRef.subscription?.status !== 'active' ||
                tenantFromRef.subscription?.paypalOrderId !== orderId
              ) {
                console.warn(
                  `PAYMENT.CAPTURE.COMPLETED: subscription not yet activated for tenant ${match[1]} — capture-order route should handle this`
                );
              }
            }
          } else {
            console.warn(`PAYMENT.CAPTURE.COMPLETED: no tenant found for orderId ${orderId}`);
          }
          break;
        }

        // If subscription is already active for this order, skip to avoid double-processing
        if (
          tenant.subscription?.status === 'active' &&
          tenant.subscription?.paypalOrderId === orderId
        ) {
          console.log(`PAYMENT.CAPTURE.COMPLETED: already processed for tenant ${tenant._id}`);
          break;
        }

        // Mark subscription active (safety net if capture-order route failed)
        tenant.subscription = tenant.subscription || ({} as any);
        tenant.subscription.status = 'active';
        tenant.subscription.paypalOrderId = orderId;

        // Update corresponding payment history entry if present
        const histEntry = tenant.subscription.paymentHistory?.find(
          (p: any) => p.orderId === orderId
        );
        if (histEntry) {
          histEntry.status = 'completed';
        }

        await tenant.save();
        console.log(`PAYMENT.CAPTURE.COMPLETED: subscription activated for tenant ${tenant._id}`);
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        // resource is the refund object; get the original capture/order id
        const relatedOrderId =
          resource?.supplementary_data?.related_ids?.order_id ||
          resource?.links?.find((l: any) => l.rel === 'up')?.href?.split('/')?.pop();

        if (!relatedOrderId) {
          console.warn('PAYMENT.CAPTURE.REFUNDED: no orderId found in webhook payload');
          break;
        }

        const tenant = await Tenant.findOne({
          $or: [
            { 'subscription.paypalOrderId': relatedOrderId },
            { 'subscription.paymentHistory.orderId': relatedOrderId },
          ],
        });

        if (!tenant) {
          console.warn(`PAYMENT.CAPTURE.REFUNDED: no tenant found for orderId ${relatedOrderId}`);
          break;
        }

        tenant.subscription.status = 'cancelled';

        // Mark the payment record as refunded
        const payment = tenant.subscription.paymentHistory?.find(
          (p: any) => p.orderId === relatedOrderId
        );
        if (payment) {
          payment.status = 'refunded';
        }

        await tenant.save();
        console.log(`PAYMENT.CAPTURE.REFUNDED: subscription cancelled for tenant ${tenant._id}`);
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        const deniedOrderId = resource?.supplementary_data?.related_ids?.order_id;
        if (deniedOrderId) {
          const tenant = await Tenant.findOne({
            'subscription.paypalOrderId': deniedOrderId,
          });
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

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing PayPal webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

