import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/payments/invoice-pay', () => ({
  MIN_ONLINE_AMOUNT: 20,
  createPayPageToken: (tenantId: string, invoiceId: string, accountId?: string | null) => ({
    token: `tok-${tenantId}-${invoiceId}-${accountId || 'any'}`,
    expiresAt: new Date('2026-12-01T00:00:00Z'),
  }),
}));

import { makePayLink, payableBalance, payLinkOrigin, payOnlineOffer, RECENT_CHECKOUT_MS } from '@/lib/payments/pay-link';

const NOW = Date.parse('2026-10-30T08:00:00Z');
const open = { status: 'unpaid', total: 500, outstandingBalance: 500 };

describe('pay links', () => {
  it('charges the stored balance, else the total, to the centavo', () => {
    expect(payableBalance({ total: 500, outstandingBalance: 120.456 })).toBe(120.46);
    expect(payableBalance({ total: 300 })).toBe(300);
    expect(payableBalance({})).toBe(0);
  });

  it("uses the caller's page origin, else the app URL", () => {
    expect(payLinkOrigin('https://my-clinic.example.com')).toBe('https://my-clinic.example.com');
    expect(payLinkOrigin('null')).toMatch(/^https?:\/\//);
    expect(makePayLink('https://x.test', 't1', 'i1').url).toBe('https://x.test/pay/tok-t1-i1-any');
    expect(makePayLink('https://x.test', 't1', 'i1', 'a1').url).toBe('https://x.test/pay/tok-t1-i1-a1');
  });
});

describe('payOnlineOffer', () => {
  const offer = (inv: any, providers: string[], currency = 'PHP') => payOnlineOffer(inv, { currency, providers, now: NOW });

  it('offers an online checkout when the clinic has a gateway account and the balance meets the minimum', () => {
    expect(offer(open, ['paymongo'])).toEqual({
      offered: true,
      code: null,
      amount: 500,
      minimum: 20,
      methods: ['online'],
      pendingClaim: false,
      recentCheckoutAt: null,
    });
  });

  it('offers a QR / bank transfer claim for any amount, but no checkout under the minimum', () => {
    const small = { ...open, outstandingBalance: 15 };
    expect(offer(small, ['paymongo', 'manual_qr'])).toMatchObject({ offered: true, methods: ['manual'] });
    expect(offer(small, ['xendit'])).toMatchObject({ offered: false, code: 'BELOW_MINIMUM', methods: [] });
  });

  it('refuses settled, refunded, non-peso and account-less invoices with a code', () => {
    expect(offer({ ...open, status: 'refunded' }, ['paymongo'])).toMatchObject({ offered: false, code: 'REFUNDED', amount: 0 });
    expect(offer({ ...open, outstandingBalance: 0 }, ['paymongo'])).toMatchObject({ offered: false, code: 'NOTHING_OWED' });
    expect(offer({ ...open, status: 'paid' }, ['paymongo'])).toMatchObject({ offered: false, code: 'NOTHING_OWED' });
    expect(offer(open, ['paymongo'], 'USD')).toMatchObject({ offered: false, code: 'UNSUPPORTED_CURRENCY' });
    expect(offer(open, [])).toMatchObject({ offered: false, code: 'NO_PAYMENT_OPTION' });
  });

  it('reports a claim awaiting staff and a checkout started in the last couple of hours', () => {
    const recent = new Date(NOW - 10 * 60 * 1000);
    const r = offer(
      {
        ...open,
        paymentClaims: [{ status: 'rejected' }, { status: 'pending' }],
        payLinks: [{ createdAt: new Date(NOW - RECENT_CHECKOUT_MS - 1) }, { createdAt: recent }],
      },
      ['paymongo']
    );
    expect(r.pendingClaim).toBe(true);
    expect(r.recentCheckoutAt).toBe(recent.toISOString());
    expect(offer({ ...open, payLinks: [{ createdAt: new Date(NOW - RECENT_CHECKOUT_MS - 1) }] }, ['paymongo']).recentCheckoutAt).toBeNull();
    // Once paid, neither matters.
    expect(offer({ ...open, outstandingBalance: 0, paymentClaims: [{ status: 'pending' }], payLinks: [{ createdAt: recent }] }, ['paymongo']))
      .toMatchObject({ pendingClaim: false, recentCheckoutAt: null });
  });
});
