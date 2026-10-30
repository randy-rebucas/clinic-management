import 'server-only';
import { isOnlineProvider } from './providers';
import { createPayPageToken, MIN_ONLINE_AMOUNT } from './invoice-pay';

/**
 * Pay-page links for one invoice, shared by the staff "Send payment link" route and the patient
 * app (/api/patients/me/invoices/[id]/pay-link), so both mint the same signed /pay/<token> link.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the pay page will charge: the stored balance, else the total (as lib/payments/invoice-pay.ts reads it). */
export function payableBalance(invoice: { outstandingBalance?: number | null; total?: number | null }): number {
  return round2(Number(invoice.outstandingBalance ?? invoice.total) || 0);
}

/** Base URL for pay links: the caller's own page when it sent one (staff), else the configured app URL. */
export function payLinkOrigin(origin?: string | null): string {
  if (origin && origin !== 'null') return origin;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** A signed link to the invoice's pay page, offering one account or (none given) every usable one. */
export function makePayLink(origin: string, tenantId: string, invoiceId: string, accountId?: string | null) {
  const { token, expiresAt } = createPayPageToken(tenantId, invoiceId, accountId ?? null);
  return { url: `${origin}/pay/${token}`, expiresAt };
}

export type PayOnlineCode = 'REFUNDED' | 'NOTHING_OWED' | 'UNSUPPORTED_CURRENCY' | 'NO_PAYMENT_OPTION' | 'BELOW_MINIMUM';

/** Patient-facing reason a bill can't be paid in the app, by code. */
export const PAY_ONLINE_ERRORS: Record<PayOnlineCode, string> = {
  REFUNDED: 'This invoice was refunded.',
  NOTHING_OWED: 'Nothing is owed on this invoice.',
  UNSUPPORTED_CURRENCY: 'This clinic doesn’t take payments in the app. Please pay at the front desk.',
  NO_PAYMENT_OPTION: 'This clinic doesn’t take payments in the app yet. Please pay at the front desk.',
  BELOW_MINIMUM: `Online payments start at ₱${MIN_ONLINE_AMOUNT}. Please pay at the front desk.`,
};

/** A checkout started this recently may still be paid; its webhook can lag behind the patient. */
export const RECENT_CHECKOUT_MS = 2 * 60 * 60 * 1000;

export interface PayOnlineOffer {
  offered: boolean;
  /** Why not, when not offered. */
  code: PayOnlineCode | null;
  amount: number;
  minimum: number;
  /** How the pay page lets them pay: a GCash/Maya/card checkout, and/or a QR or bank transfer staff confirm. */
  methods: Array<'online' | 'manual'>;
  /** An "I've paid" claim staff haven't confirmed yet. */
  pendingClaim: boolean;
  /** The latest online checkout started in the last couple of hours, when it is still owed (ISO). */
  recentCheckoutAt: string | null;
}

type OfferInvoice = {
  status?: string | null;
  total?: number | null;
  outstandingBalance?: number | null;
  paymentClaims?: Array<{ status?: string | null }> | null;
  payLinks?: Array<{ createdAt?: Date | string | null }> | null;
};

/**
 * Whether the patient can pay this invoice from the app, given the providers of the accounts it
 * can be paid into (lib/payments/accounts.ts invoicePayOptions). An online account counts only
 * from the gateways' minimum charge; a QR / bank-transfer account takes any amount.
 */
export function payOnlineOffer(
  invoice: OfferInvoice,
  opts: { currency: string; providers: string[]; now?: number }
): PayOnlineOffer {
  const amount = payableBalance(invoice);
  const now = opts.now ?? Date.now();
  const latest = (invoice.payLinks ?? []).reduce<number>((max, l) => {
    const t = l?.createdAt ? new Date(l.createdAt).getTime() : NaN;
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const methods: PayOnlineOffer['methods'] = [];
  if (opts.providers.some((p) => isOnlineProvider(p)) && amount >= MIN_ONLINE_AMOUNT) methods.push('online');
  if (opts.providers.some((p) => !isOnlineProvider(p))) methods.push('manual');

  let code: PayOnlineCode | null = null;
  if (invoice.status === 'refunded') code = 'REFUNDED';
  else if (amount <= 0 || invoice.status === 'paid') code = 'NOTHING_OWED';
  else if (opts.currency !== 'PHP') code = 'UNSUPPORTED_CURRENCY';
  else if (!opts.providers.length) code = 'NO_PAYMENT_OPTION';
  else if (!methods.length) code = 'BELOW_MINIMUM';

  const owing = code !== 'REFUNDED' && code !== 'NOTHING_OWED';
  return {
    offered: code === null,
    code,
    amount: owing ? amount : 0,
    minimum: MIN_ONLINE_AMOUNT,
    methods: code === null ? methods : [],
    pendingClaim: owing && (invoice.paymentClaims ?? []).some((c) => c?.status === 'pending'),
    recentCheckoutAt: owing && latest > 0 && now - latest < RECENT_CHECKOUT_MS ? new Date(latest).toISOString() : null,
  };
}
