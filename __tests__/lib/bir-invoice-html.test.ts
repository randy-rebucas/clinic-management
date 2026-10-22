import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('server-only', () => ({}));

import { birInvoiceHTML } from '@/lib/bir-invoice-html';
import { BIR_DEFAULTS } from '@/lib/bir';

const protection = { head: '<!--head-->', watermark: '<!--wm-->', banner: '<!--banner-->', seal: '<!--seal-->' };
const clinic = { name: 'Sunrise Clinic', address: 'Cebu City', phone: '0917 000 0000', email: 'hi@sunrise.ph', tin: '123456789' };

const invoice = {
  invoiceNumber: 'INV-0001',
  bir: { serialNo: 'A-000123', issuedAt: new Date('2026-10-01T02:00:00Z') },
  patient: { firstName: 'Ana', lastName: 'Cruz', address: { street: '1 Main', city: 'Cebu', state: 'Cebu', zipCode: '6000' } },
  items: [{ description: 'Consultation', quantity: 1, unitPrice: 500, total: 500 }],
  subtotal: 500,
  professionalFee: 300,
  discounts: [{ type: 'senior', percentage: 20, amount: 160, idNumber: 'OSCA-1' }],
  taxBreakdown: { grossSales: 800, lessVat: 0, vatableSales: 0, vatExemptSales: 800, zeroRatedSales: 0, vatAmount: 0 },
  total: 640,
  payments: [{ method: 'gcash', amount: 640, referenceNo: 'R1' }],
  outstandingBalance: 0,
};

describe('birInvoiceHTML', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T00:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('renders the clinic sales invoice unchanged (non-VAT, senior discount)', () => {
    const html = birInvoiceHTML({
      invoice,
      bir: { ...BIR_DEFAULTS, enabled: true, registeredName: 'Sunrise Medical Inc.', branchCode: '00001', permitNumber: 'PTU-9', permitIssuedOn: '2026-01-01', serialPrefix: 'A', serialStart: 1, serialEnd: 5000 },
      clinic,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      protection,
    });
    expect(html).toMatchSnapshot();
  });

  it('renders the clinic sales invoice unchanged (VAT)', () => {
    const html = birInvoiceHTML({
      invoice: { ...invoice, discounts: [], taxBreakdown: { grossSales: 800, vatableSales: 714.29, vatAmount: 85.71, vatExemptSales: 0, zeroRatedSales: 0 }, total: 800 },
      bir: { ...BIR_DEFAULTS, enabled: true, regime: 'vat', registeredName: '', branchCode: '00000', permitNumber: 'PTU-9', permitIssuedOn: '', serialPrefix: '', serialStart: 1, serialEnd: 0 },
      clinic,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      protection,
    });
    expect(html).toMatchSnapshot();
  });
});
