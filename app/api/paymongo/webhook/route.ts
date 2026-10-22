import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymongoSignature, type CheckoutSession } from '@/lib/paymongo';
import { applyPaidCheckout } from '@/lib/paymongo-apply';
import { reverseSubscriptionPayment } from '@/lib/subscription';

/**
 * PayMongo webhook (register it for checkout_session.payment.paid and payment.refunded). The signature is checked
 * against the raw body before anything is read; a payment that can't be applied yet answers 503
 * so PayMongo delivers it again, one that never can answers 200 and is logged for a person.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYMONGO_WEBHOOK_SECRET not set — refusing PayMongo webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const attrs = event?.data?.attributes ?? {};
  if (!verifyPaymongoSignature(request.headers.get('paymongo-signature'), raw, secret, attrs.livemode === true)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (attrs.type === 'payment.refunded') {
    // Subscription payments only: the paid time comes back off the plan (lib/subscription.ts).
    const payment = attrs.data;
    const pa = payment?.attributes ?? {};
    const refundedCents = (pa.refunds ?? []).reduce((sum: number, r: any) => sum + (Number(r?.attributes?.amount) || 0), 0);
    const refunded = pa.status === 'refunded' && !refundedCents ? 'full' : refundedCents / 100;
    try {
      const r = await reverseSubscriptionPayment({ transactionId: payment?.id }, refunded);
      if (r.reversed) console.log(`PayMongo payment ${payment?.id} refunded: subscription time taken back`);
    } catch (error) {
      console.error('PayMongo refund webhook failed:', error);
      return NextResponse.json({ error: 'Retry later' }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  }
  if (attrs.type !== 'checkout_session.payment.paid') return NextResponse.json({ received: true });

  const cs = attrs.data;
  const a = cs?.attributes ?? {};
  const session: CheckoutSession = {
    id: cs?.id,
    checkoutUrl: a.checkout_url,
    status: a.status,
    payments: (a.payments ?? []).map((p: any) => ({
      id: p.id,
      amount: (Number(p.attributes?.amount) || 0) / 100,
      status: p.attributes?.status,
      method: p.attributes?.source?.type ?? p.attributes?.payment_method_used,
    })),
    metadata: a.metadata ?? {},
  };

  try {
    const r = await applyPaidCheckout(session);
    if (!r.ok) {
      console.error(`PayMongo checkout ${session.id} not applied: ${r.error}`);
      if (r.retry) return NextResponse.json({ error: 'Retry later' }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayMongo webhook failed:', error);
    return NextResponse.json({ error: 'Retry later' }, { status: 503 });
  }
}
