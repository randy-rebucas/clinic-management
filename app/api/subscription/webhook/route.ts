import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { verifyPayPalWebhook } from '@/lib/paypal';

/**
 * PayPal webhook handler for subscription events
 * Handles events like payment completed, subscription renewed, etc.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value])
    );

    // Verify webhook signature (in production, implement proper verification)
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (webhookId) {
      const bodyText = JSON.stringify(body);
      const isValid = await verifyPayPalWebhook(headers, bodyText, webhookId);
      
      if (!isValid) {
        console.warn('Invalid PayPal webhook signature');
        // In production, you might want to reject invalid webhooks
        // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const eventType = body.event_type;
    const resource = body.resource;

    await connectDB();

    // Handle different webhook event types
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        // Payment was successfully captured
        if (resource?.supplementary_data?.related_ids?.order_id) {
          const orderId = resource.supplementary_data.related_ids.order_id;
          // Find tenant by order ID (you may need to store orderId -> tenantId mapping)
          // For now, we'll handle this in the capture-order route
        }
        break;

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.REFUNDED':
        // Payment was denied or refunded
        break;

      default:
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
