import 'server-only';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { CheckoutState, GatewayAdapter, GatewayCredentials, GatewayEvent } from './types';

/**
 * Xendit with a clinic's own keys, through Payment Sessions (hosted payment link, PH, pesos):
 * POST /sessions creates it, GET /sessions/{id} reads it back. Notices carry the account's
 * Webhook Verification Token in `x-callback-token`, compared in constant time.
 * Docs: docs.xendit.co/apidocs/create-session, get-session, payment-session webhook.
 */

const API = 'https://api.xendit.co';

function auth(creds: GatewayCredentials) {
  return `Basic ${Buffer.from(`${creds.secretKey}:`).toString('base64')}`;
}

async function call(creds: GatewayCredentials, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: auth(creds), 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const xenditAdapter: GatewayAdapter = {
  provider: 'xendit',
  label: 'Xendit',
  keyHint: 'xnd_production_… or xnd_development_…',
  available: true,

  async createCheckout(creds, req) {
    // reference_id must be unique per session; the invoice number plus a random tail.
    const reference = `${req.reference}-${randomBytes(4).toString('hex')}`.slice(0, 64);
    const { res, json } = await call(creds, '/sessions', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: reference,
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        amount: req.amount,
        currency: 'PHP',
        country: 'PH',
        description: req.description.slice(0, 1000),
        success_return_url: req.successUrl,
        cancel_return_url: req.cancelUrl,
        metadata: Object.fromEntries(Object.entries(req.metadata).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 80)])),
      }),
    });
    if (!res.ok || !json?.payment_session_id || !json?.payment_link_url) {
      throw new Error(`Xendit ${res.status}: ${json?.message ?? json?.error_code ?? 'session could not be created'}`);
    }
    return { id: json.payment_session_id, url: json.payment_link_url };
  },

  async retrieveCheckout(creds, id): Promise<CheckoutState> {
    if (!/^ps-[A-Za-z0-9]+$/.test(id)) throw new Error('Not a Xendit payment session id');
    const { res, json } = await call(creds, `/sessions/${id}`);
    if (!res.ok) throw new Error(`Xendit ${res.status}: ${json?.message ?? 'session could not be read'}`);
    const done = json?.status === 'COMPLETED' && json?.payment_id;
    return {
      id,
      paid: done ? Number(json.amount) || 0 : 0,
      paymentId: done ? String(json.payment_id) : undefined,
      metadata: json?.metadata && typeof json.metadata === 'object' ? json.metadata : {},
    };
  },

  verifyEvent(creds, rawBody, headers): GatewayEvent | null {
    const token = headers.get('x-callback-token');
    if (!creds.webhookSecret || !token || !sameToken(token, creds.webhookSecret)) return null;
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const id = event?.data?.payment_session_id;
    if (event?.event === 'payment_session.completed' && typeof id === 'string') return { kind: 'paid', checkoutId: id };
    return { kind: 'ignore' };
  },

  async testConnection(creds) {
    try {
      const { res } = await call(creds, '/balance');
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'Xendit refused this key.' };
      if (!res.ok) return { ok: false, error: `Xendit answered ${res.status}.` };
      return { ok: true, mode: creds.secretKey.startsWith('xnd_production_') ? 'live' : 'test' };
    } catch {
      return { ok: false, error: 'Xendit could not be reached.' };
    }
  },
};
