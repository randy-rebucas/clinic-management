import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPlatformPaymongoKeys, isPlatformPaymongoReady } from '@/lib/platform-config';

/**
 * PayMongo (Philippines): hosted checkout for GCash, Maya, cards, GrabPay and QR Ph, in pesos.
 * Server-only; the secret key never reaches the browser.
 *
 * Every call takes the secret key to use: a clinic's own account (lib/payments) or, when none is
 * passed, the platform's (Platform → Configuration, else env PAYMONGO_SECRET_KEY), which takes
 * subscriptions and the med-rep fee.
 */

const API = 'https://api.paymongo.com/v1';

export const PAYMONGO_METHODS = ['gcash', 'paymaya', 'card', 'grab_pay', 'qrph'] as const;

/** The platform's PayMongo account is set up (Platform → Configuration or env). */
export async function isPayMongoConfigured(): Promise<boolean> {
  return isPlatformPaymongoReady();
}

async function auth(secretKey?: string) {
  const key = secretKey ?? (await getPlatformPaymongoKeys())?.secretKey;
  if (!key) throw new Error('PayMongo is not configured');
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

/** Pesos to centavos, the unit PayMongo's API takes. */
export const toCentavos = (pesos: number) => Math.round(pesos * 100);

export type CheckoutPurpose = 'subscription' | 'invoice' | 'medrep';

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
  status: string;
  /** Paid payments on the session, amounts in pesos. */
  payments: { id: string; amount: number; status: string; method?: string }[];
  metadata: Record<string, string>;
}

function parseSession(data: any): CheckoutSession {
  const a = data?.attributes ?? {};
  return {
    id: data?.id,
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
}

/** Start a hosted checkout. `metadata` comes back on the webhook and must identify what is paid. */
export async function createCheckoutSession(opts: {
  name: string;
  amount: number;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string> & { purpose: CheckoutPurpose };
  email?: string;
}, secretKey?: string): Promise<CheckoutSession> {
  const res = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: { Authorization: await auth(secretKey), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: opts.name.slice(0, 255), amount: toCentavos(opts.amount), currency: 'PHP', quantity: 1 }],
          payment_method_types: PAYMONGO_METHODS,
          description: opts.description.slice(0, 255),
          reference_number: opts.referenceNumber,
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
          send_email_receipt: Boolean(opts.email),
          show_description: true,
          show_line_items: true,
          metadata: opts.metadata,
          ...(opts.email ? { billing: { email: opts.email } } : {}),
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`PayMongo ${res.status}: ${json?.errors?.[0]?.detail ?? 'checkout could not be created'}`);
  return parseSession(json.data);
}

export async function retrieveCheckoutSession(id: string, secretKey?: string): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new Error('Not a checkout session id');
  const res = await fetch(`${API}/checkout_sessions/${id}`, { headers: { Authorization: await auth(secretKey), Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`PayMongo ${res.status}: ${json?.errors?.[0]?.detail ?? 'checkout could not be read'}`);
  return parseSession(json.data);
}

/** Total paid on a session, in pesos. */
export const paidTotal = (s: CheckoutSession) => Math.round(s.payments.filter((p) => p.status === 'paid').reduce((t, p) => t + p.amount, 0) * 100) / 100;

/** Max age of a webhook we accept, against replays. */
const WEBHOOK_TOLERANCE_S = 5 * 60;

/**
 * Check a `Paymongo-Signature` header (`t=<unix>,te=<test sig>,li=<live sig>`): HMAC-SHA256 of
 * `<t>.<raw body>` with the webhook secret, compared to `li` for live events and `te` for test
 * events. Constant-time, and stale timestamps are refused.
 */
export function verifyPaymongoSignature(header: string | null, rawBody: string, secret: string, livemode: boolean, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  ) as Record<string, string>;
  const t = Number(parts.t);
  const sig = livemode ? parts.li : parts.te;
  if (!Number.isFinite(t) || !sig) return false;
  if (Math.abs(now / 1000 - t) > WEBHOOK_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Check that a secret key works, without charging anything: list one payment. Used by the
 * console's and clinic settings' "Test connection".
 */
export async function testPaymongoKey(secretKey: string): Promise<{ ok: true; mode: 'live' | 'test' } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}/payments?limit=1`, {
      headers: { Authorization: await auth(secretKey), Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { ok: false, error: 'PayMongo refused this key.' };
    if (!res.ok) return { ok: false, error: `PayMongo answered ${res.status}.` };
    return { ok: true, mode: secretKey.startsWith('sk_live_') ? 'live' : 'test' };
  } catch {
    return { ok: false, error: 'PayMongo could not be reached.' };
  }
}
