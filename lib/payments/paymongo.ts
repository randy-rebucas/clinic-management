import 'server-only';
import { createCheckoutSession, paidTotal, retrieveCheckoutSession, testPaymongoKey, verifyPaymongoSignature } from '@/lib/paymongo';
import type { CheckoutState, GatewayAdapter, GatewayEvent } from './types';

/** PayMongo with a clinic's own keys: hosted checkout (GCash, Maya, cards, QR Ph), pesos. */
export const paymongoAdapter: GatewayAdapter = {
  provider: 'paymongo',
  label: 'PayMongo',
  keyHint: 'sk_live_… or sk_test_…',
  available: true,

  async createCheckout(creds, req) {
    const s = await createCheckoutSession(
      {
        name: req.name,
        amount: req.amount,
        description: req.description,
        referenceNumber: req.reference,
        successUrl: req.successUrl,
        cancelUrl: req.cancelUrl,
        email: req.email,
        metadata: { ...req.metadata, purpose: 'invoice' },
      },
      creds.secretKey
    );
    return { id: s.id, url: s.checkoutUrl };
  },

  async retrieveCheckout(creds, id): Promise<CheckoutState> {
    const s = await retrieveCheckoutSession(id, creds.secretKey);
    const paid = s.payments.find((p) => p.status === 'paid');
    return { id: s.id, paid: paidTotal(s), paymentId: paid?.id, method: paid?.method, metadata: s.metadata };
  },

  verifyEvent(creds, rawBody, headers): GatewayEvent | null {
    if (!creds.webhookSecret) return null;
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const attrs = event?.data?.attributes ?? {};
    if (!verifyPaymongoSignature(headers.get('paymongo-signature'), rawBody, creds.webhookSecret, attrs.livemode === true)) return null;

    if (attrs.type === 'checkout_session.payment.paid') {
      const id = attrs.data?.id;
      return typeof id === 'string' ? { kind: 'paid', checkoutId: id } : { kind: 'ignore' };
    }
    if (attrs.type === 'payment.refunded') {
      const p = attrs.data;
      const pa = p?.attributes ?? {};
      const cents = (pa.refunds ?? []).reduce((sum: number, r: any) => sum + (Number(r?.attributes?.amount) || 0), 0);
      if (typeof p?.id !== 'string') return { kind: 'ignore' };
      return { kind: 'refunded', paymentId: p.id, refundedAmount: pa.status === 'refunded' && !cents ? 'full' : cents / 100 };
    }
    return { kind: 'ignore' };
  },

  testConnection(creds) {
    return testPaymongoKey(creds.secretKey);
  },
};
