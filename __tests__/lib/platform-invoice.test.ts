import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: () => { throw new Error('outside a request'); } }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ success: true })), escapeHtml: (v: unknown) => String(v) }));
vi.mock('@/lib/pdf', () => ({ htmlToPdf: vi.fn(async () => new Uint8Array([1])), pdfFilename: (...p: string[]) => `${p.join('-')}.pdf` }));

// ── In-memory stand-ins for the three collections the issuer touches ─────────
const invoices = new Map<string, any>();
let counter = 0;
const tenant: any = {
  _id: 't1',
  name: 'Sunrise Clinic',
  email: 'admin@sunrise.ph',
  address: { city: 'Cebu' },
  subscription: {
    expiresAt: new Date('2026-12-01'),
    paymentHistory: [
      { orderId: 'pm_a', transactionId: 'pay_a', amount: 3999, currency: 'PHP', plan: 'professional', billingCycle: 'monthly', status: 'completed', paidAt: new Date('2026-11-01') },
      { orderId: 'pm_b', transactionId: 'pay_b', amount: 1499, currency: 'PHP', plan: 'basic', billingCycle: 'monthly', status: 'completed', paidAt: new Date('2026-11-02') },
    ],
  },
};

const matches = (doc: any, filter: any): boolean =>
  Object.entries(filter).every(([k, cond]: [string, any]) => {
    if (k === '$or') return cond.some((f: any) => matches(doc, f));
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.includes(v);
      if ('$ne' in cond) return v !== cond.$ne;
      if ('$exists' in cond) return cond.$exists ? v !== undefined : v === undefined;
      if ('$lt' in cond) return v !== undefined && v < cond.$lt;
    }
    return v === cond;
  });
const apply = (doc: any, update: any) => {
  Object.assign(doc, update.$set ?? {});
  for (const k of Object.keys(update.$unset ?? {})) delete doc[k];
  return doc;
};

vi.mock('@/models/PlatformInvoice', () => ({
  default: {
    collection: { collectionName: 'platforminvoices' },
    findOneAndUpdate: vi.fn(async (filter: any, update: any, opts: any) => {
      let doc = invoices.get(filter.orderId);
      if (!doc && opts?.upsert) {
        doc = { _id: `inv_${filter.orderId}`, ...update.$setOnInsert };
        invoices.set(filter.orderId, doc);
        return { ...doc };
      }
      if (!doc || !matches(doc, filter)) return null;
      return { ...apply(doc, update) };
    }),
    findOne: vi.fn(async (filter: any) => {
      const doc = invoices.get(filter.orderId);
      return doc ? { ...doc } : null;
    }),
    updateOne: vi.fn(async (filter: any, update: any) => {
      const { _id, orderId, ...rest } = filter;
      const doc = orderId ? invoices.get(orderId) : [...invoices.values()].find((d) => d._id === _id);
      if (doc && matches(doc, rest)) apply(doc, update);
    }),
    find: vi.fn(() => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: vi.fn(() => ({ select: () => ({ lean: async () => tenant }) })),
    aggregate: vi.fn(async () => []),
  },
}));
vi.mock('@/models/Counter', () => ({
  default: {
    updateOne: vi.fn(async (filter: any, update: any) => {
      if (update.$max) counter = Math.max(counter, update.$max.seq);
      if (update.$inc && (filter.seq === undefined || filter.seq === counter)) counter += update.$inc.seq;
    }),
  },
}));
vi.mock('@/lib/counters', () => ({ nextSequence: vi.fn(async () => ++counter) }));

const issuer = {
  sellerName: 'DevCom Digital',
  tradeName: '',
  tin: '123-456-789',
  branchCode: '00000',
  address: 'Cebu City',
  vatRegime: 'non_vat' as const,
  vatRate: 12,
  permitNumber: 'ATP-1',
  permitIssuedOn: '',
  serialPrefix: 'MCS',
  serialStart: 1,
  serialEnd: 2,
  footerNote: '',
};
const getBillingIssuer = vi.fn(async (): Promise<typeof issuer | null> => issuer);
vi.mock('@/lib/platform-config', () => ({
  getBillingIssuer: () => getBillingIssuer(),
  platformSerialKey: (p: string) => `platform-sales-invoice:${p}`,
}));

import { cancelSubscriptionInvoice, issueSubscriptionInvoice, vatSplit } from '@/lib/platform-invoice';
import { renderPlatformInvoice } from '@/lib/platform-invoice';
import { sendEmail } from '@/lib/email';

describe('subscription sales invoices', () => {
  beforeEach(() => {
    invoices.clear();
    counter = 0;
    getBillingIssuer.mockResolvedValue(issuer);
    vi.mocked(sendEmail).mockClear();
  });

  it('two calls at once issue one invoice with one serial, and email it once', async () => {
    const [a, b] = await Promise.all([issueSubscriptionInvoice('pm_a'), issueSubscriptionInvoice('pm_a')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['busy', 'issued']);
    expect(invoices.get('pm_a')).toMatchObject({ status: 'issued', serialNo: 'MCS-0000001' });
    expect(counter).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // A later call returns the same invoice.
    expect(await issueSubscriptionInvoice('pm_a')).toMatchObject({ status: 'issued', fresh: false });
    expect(counter).toBe(1);
  });

  it('holds the invoice until the issuer is entered', async () => {
    getBillingIssuer.mockResolvedValue(null);
    expect(await issueSubscriptionInvoice('pm_a')).toMatchObject({ status: 'held' });
    expect(invoices.get('pm_a').serialNo).toBeUndefined();
    getBillingIssuer.mockResolvedValue(issuer);
    expect(await issueSubscriptionInvoice('pm_a')).toMatchObject({ status: 'issued' });
  });

  it('holds when the serial range is used up, and hands the number back', async () => {
    counter = 2; // MCS-0000001 and -000002 already used; the range ends at 2
    expect(await issueSubscriptionInvoice('pm_b')).toMatchObject({ status: 'held' });
    expect(counter).toBe(2);
    expect(invoices.get('pm_b').heldReason).toMatch(/used up/);
  });

  it('keeps a snapshot of the seller: later issuer edits never change an issued invoice', async () => {
    await issueSubscriptionInvoice('pm_a');
    getBillingIssuer.mockResolvedValue({ ...issuer, sellerName: 'DevCom Digital Inc.', address: 'Manila' });
    await issueSubscriptionInvoice('pm_a');
    expect(invoices.get('pm_a').seller).toMatchObject({ sellerName: 'DevCom Digital', address: 'Cebu City' });
    expect(renderPlatformInvoice(invoices.get('pm_a'))).toContain('DevCom Digital</h1>');
  });

  it('a refund cancels the invoice and keeps its serial; the page says CANCELLED', async () => {
    await issueSubscriptionInvoice('pm_a');
    await cancelSubscriptionInvoice('pm_a', 'Payment refunded');
    expect(invoices.get('pm_a')).toMatchObject({ status: 'cancelled', serialNo: 'MCS-0000001', cancelledReason: 'Payment refunded' });
    expect(renderPlatformInvoice(invoices.get('pm_a'))).toContain('CANCELLED');
  });

  it('splits VAT out of the amount only for a VAT-registered issuer', () => {
    expect(vatSplit(1120, { vatRegime: 'vat', vatRate: 12 })).toEqual({ vatableSales: 1000, vatAmount: 120 });
    expect(vatSplit(1120, { vatRegime: 'non_vat', vatRate: 12 })).toEqual({ vatableSales: 0, vatAmount: 0 });
  });
});
