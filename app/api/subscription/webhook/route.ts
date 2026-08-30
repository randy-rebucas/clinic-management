import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runAsSystem } from '@/lib/tenant-context';
import { verifyPayPalWebhook } from '@/lib/paypal';
import { getTenantById } from '@/lib/data/tenant';

/**
 * PayPal webhook handler for subscription events
 * Handles PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED
 *
 * Migrated off Mongoose: Tenant is now a Prisma model (Postgres), and its
 * `subscription.*` sub-document became flattened `subscription*` columns on
 * `Tenant` plus a separate `TenantPaymentHistory` table (see
 * prisma/schema.prisma). Lookups/updates below are wrapped in runAsSystem()
 * since a webhook has no request-scoped tenant context to run under —
 * Tenant is the tenant-scoping root anyway (lib/data/tenant.ts), so the
 * wrapping here is defense-in-depth rather than load-bearing.
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

    // Find a tenant whose current subscription order, or payment history,
    // references this PayPal order id.
    const findTenantByOrderId = (orderId: string) =>
      runAsSystem(() =>
        prisma.tenant.findFirst({
          where: {
            OR: [
              { subscriptionPaypalOrderId: orderId },
              { paymentHistory: { some: { orderId } } },
            ],
          },
        })
      );

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
        let tenant = await findTenantByOrderId(orderId);

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
            const tenantFromRef = await runAsSystem(() => getTenantById(match[1]));
            if (tenantFromRef) {
              console.log(`PAYMENT.CAPTURE.COMPLETED: tenant found via reference_id for order ${orderId}`);
              // capture-order route is the primary activation path; webhook is a safety net
              // Only act if subscription is not yet active for this order
              if (
                tenantFromRef.subscriptionStatus !== 'active' ||
                tenantFromRef.subscriptionPaypalOrderId !== orderId
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

        // ── Idempotency: skip events already processed ─────────────────────
        if (transmissionId && tenant.subscriptionProcessedWebhookIds.includes(transmissionId)) {
          console.log(`Webhook ${transmissionId} already processed — skipping`);
          break;
        }

        // If subscription is already active for this order, skip to avoid double-processing
        if (
          tenant.subscriptionStatus === 'active' &&
          tenant.subscriptionPaypalOrderId === orderId
        ) {
          console.log(`PAYMENT.CAPTURE.COMPLETED: already processed for tenant ${tenant.id}`);
          break;
        }

        // Stamp the transmissionId so this event is never processed twice
        const processedWebhookIds = transmissionId
          ? [...tenant.subscriptionProcessedWebhookIds, transmissionId].slice(-50) // keep last 50 to bound array size
          : tenant.subscriptionProcessedWebhookIds;

        await runAsSystem(() =>
          prisma.$transaction([
            // Mark subscription active (safety net if capture-order route failed)
            prisma.tenant.update({
              where: { id: tenant!.id },
              data: {
                subscriptionStatus: 'active',
                subscriptionPaypalOrderId: orderId,
                subscriptionProcessedWebhookIds: processedWebhookIds,
              },
            }),
            // Update corresponding payment history entry if present
            prisma.tenantPaymentHistory.updateMany({
              where: { tenantId: tenant!.id, orderId },
              data: { status: 'completed' },
            }),
          ])
        );
        console.log(`PAYMENT.CAPTURE.COMPLETED: subscription activated for tenant ${tenant.id}`);
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

        const tenant = await findTenantByOrderId(relatedOrderId);

        if (!tenant) {
          console.warn(`PAYMENT.CAPTURE.REFUNDED: no tenant found for orderId ${relatedOrderId}`);
          break;
        }

        await runAsSystem(() =>
          prisma.$transaction([
            prisma.tenant.update({
              where: { id: tenant.id },
              data: { subscriptionStatus: 'cancelled' },
            }),
            // Mark the payment record as refunded
            prisma.tenantPaymentHistory.updateMany({
              where: { tenantId: tenant.id, orderId: relatedOrderId },
              data: { status: 'refunded' },
            }),
          ])
        );
        console.log(`PAYMENT.CAPTURE.REFUNDED: subscription cancelled for tenant ${tenant.id}`);
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        const deniedOrderId = resource?.supplementary_data?.related_ids?.order_id;
        if (deniedOrderId) {
          const tenant = await runAsSystem(() =>
            prisma.tenant.findFirst({ where: { subscriptionPaypalOrderId: deniedOrderId } })
          );
          if (tenant && tenant.subscriptionStatus === 'active') {
            await runAsSystem(() =>
              prisma.tenant.update({
                where: { id: tenant.id },
                data: { subscriptionStatus: 'cancelled' },
              })
            );
            console.log(`PAYMENT.CAPTURE.DENIED: subscription deactivated for tenant ${tenant.id}`);
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
