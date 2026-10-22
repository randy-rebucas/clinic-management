import 'server-only';
import { randomBytes } from 'crypto';
import type { CheckoutState, GatewayAdapter, GatewayCredentials, GatewayEvent } from './types';

/**
 * Maya Business (Maya Checkout) with a clinic's own keys. The checkout is created with the
 * PUBLIC key (POST /checkout/v1/checkouts); its checkoutId is the payment id, read back with the
 * SECRET key (GET /payments/v1/payments/{id}). Production pg.paymaya.com, sandbox
 * pg-sandbox.paymaya.com; Maya's keys don't say which, so "Test connection" finds out and the
 * account remembers it (mode).
 *
 * Maya signs nothing (it asks for an IP allowlist), so a notice is only a trigger: the payment is
 * read back from Maya with the secret key, and must be a checkout this invoice started with this
 * account. A forged notice can't record a payment that isn't real.
 * Docs: developers.maya.ph/reference/createv1checkout, getpaymentviapaymentid-1.
 */

const HOST = { live: 'https://pg.paymaya.com', test: 'https://pg-sandbox.paymaya.com' } as const;
const basic = (key: string) => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

async function call(url: string, key: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: basic(key), 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

const host = (creds: GatewayCredentials) => HOST[creds.mode ?? 'test'];

export const mayaAdapter: GatewayAdapter = {
  provider: 'maya',
  label: 'Maya Business',
  keyHint: 'sk-… (secret key), with the pk-… public key',
  available: true,

  async createCheckout(creds, req) {
    if (!creds.publicKey) throw new Error('Maya needs the public key');
    const { res, json } = await call(`${host(creds)}/checkout/v1/checkouts`, creds.publicKey, {
      method: 'POST',
      body: JSON.stringify({
        totalAmount: { value: req.amount, currency: 'PHP' },
        // Our own reference, max 36 characters; matching is by checkoutId.
        requestReferenceNumber: randomBytes(16).toString('hex'),
        items: [{ name: req.name.slice(0, 255), quantity: 1, totalAmount: { value: req.amount } }],
        redirectUrl: { success: req.successUrl, failure: req.cancelUrl, cancel: req.cancelUrl },
      }),
    });
    if (!res.ok || !json?.checkoutId || !json?.redirectUrl) throw new Error(`Maya ${res.status}: ${json?.message ?? 'checkout could not be created'}`);
    return { id: json.checkoutId, url: json.redirectUrl };
  },

  async retrieveCheckout(creds, id): Promise<CheckoutState> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error('Not a Maya payment id');
    const { res, json } = await call(`${host(creds)}/payments/v1/payments/${id}`, creds.secretKey);
    if (!res.ok) throw new Error(`Maya ${res.status}: ${json?.message ?? 'payment could not be read'}`);
    const paid = json?.status === 'PAYMENT_SUCCESS' && json?.isPaid !== false;
    return { id, paid: paid ? Number(json.amount) || 0 : 0, paymentId: paid ? String(json.id ?? id) : undefined, method: json?.fundSource?.type, metadata: null };
  },

  verifyEvent(_creds, rawBody): GatewayEvent | null {
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    // Only a trigger (see above): the payment is read back from Maya before anything is recorded.
    if (typeof event?.id === 'string' && event?.status === 'PAYMENT_SUCCESS') return { kind: 'paid', checkoutId: event.id };
    return { kind: 'ignore' };
  },

  async testConnection(creds) {
    if (!creds.publicKey) return { ok: false, error: 'Enter the public key (pk-…) too.' };
    try {
      for (const mode of ['live', 'test'] as const) {
        const { res } = await call(`${HOST[mode]}/payments/v1/webhooks`, creds.secretKey);
        if (res.ok) return { ok: true, mode };
      }
      return { ok: false, error: 'Maya refused this key in both production and sandbox.' };
    } catch {
      return { ok: false, error: 'Maya could not be reached.' };
    }
  },
};
