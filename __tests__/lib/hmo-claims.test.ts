import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/models/Invoice', () => ({ default: { updateOne: vi.fn(), updateMany: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Hmo', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/HmoClaimBatch', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), exists: vi.fn(), create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock('@/lib/counters', () => ({ nextSequence: vi.fn(), formatCode: vi.fn() }));
vi.mock('@/lib/invoice-payments', () => ({ recordInvoicePayments: vi.fn(), PAYMENT_EPSILON: 0.005 }));

import Invoice from '@/models/Invoice';
import HmoClaimBatch from '@/models/HmoClaimBatch';
import { recordInvoicePayments } from '@/lib/invoice-payments';
import { claimHold, claimInvoiceStates, closeBatch, recordRemittance } from '@/lib/hmo-claims';
import { claimProblem, suggestedWithholding } from '@/lib/hmo';

const TENANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439012';
const INV_A = new Types.ObjectId('507f1f77bcf86cd799439021');
const INV_B = new Types.ObjectId('507f1f77bcf86cd799439022');

function fakeBatch(status = 'submitted') {
  return {
    _id: new Types.ObjectId(),
    batchNumber: 'TR-000007',
    hmoName: 'Maxicare',
    status,
    claims: [
      { invoice: INV_A, invoiceNumber: 'INV-1', amount: 1000, paid: 0, withheld: 0, suggestedWithheld: 20, status: 'pending' },
      { invoice: INV_B, invoiceNumber: 'INV-2', amount: 500, paid: 0, withheld: 0, suggestedWithheld: 10, status: 'pending' },
    ],
    remittances: [] as any[],
    markModified: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('suggestedWithholding', () => {
  it('blends the services and professional-fee rates on the amount net of VAT', () => {
    // 1,120 claim, VAT-inclusive (net 1,000); half professional fee at 10%, half services at 2%
    expect(suggestedWithholding({ amount: 1120, pfShare: 0.5, netFactor: 1000 / 1120, servicesRate: 2, professionalRate: 10 })).toBe(60);
  });
  it('uses the services rate alone when there is no professional fee', () => {
    expect(suggestedWithholding({ amount: 500, pfShare: 0, netFactor: 1, servicesRate: 2, professionalRate: 10 })).toBe(10);
  });
});

describe('claimProblem', () => {
  it('asks for the LOA when the HMO needs one', () => {
    expect(claimProblem({ loaNumber: '', amount: 100 }, { requiresLoa: true })).toMatch(/LOA/);
    expect(claimProblem({ loaNumber: 'A-1', amount: 100 }, { requiresLoa: true })).toBeNull();
    expect(claimProblem({ amount: 100 }, { requiresLoa: false })).toBeNull();
  });
  it('refuses a claim with nothing to claim', () => {
    expect(claimProblem({ loaNumber: 'A', amount: 0 }, { requiresLoa: true })).toMatch(/No amount/);
  });
});

describe('recordRemittance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts an HMO payment and the withheld tax to each invoice, and settles the transmittal', async () => {
    const batch = fakeBatch();
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);
    vi.mocked(recordInvoicePayments).mockResolvedValue({ ok: true, invoice: {} });

    const r = await recordRemittance({
      tenantId: TENANT,
      batchId: String(batch._id),
      userId: USER,
      date: new Date('2026-10-15'),
      reference: 'CHK 1234',
      form2307Received: true,
      lines: [
        { invoiceId: String(INV_A), paid: 980, withheld: 20 },
        { invoiceId: String(INV_B), paid: 490, withheld: 10 },
      ],
    });

    expect(r).toMatchObject({ ok: true, posted: 2, failed: [] });
    const first = vi.mocked(recordInvoicePayments).mock.calls[0][0];
    expect(first.payments.map((p) => [p.method, p.amount])).toEqual([
      ['hmo', 980],
      ['cwt', 20],
    ]);
    expect(first.payments[0].referenceNo).toBe('TR-000007 · CHK 1234');
    expect(first.alsoSet).toMatchObject({ 'insurance.status': 'paid', 'insurance.paidAmount': 980, 'insurance.withheldAmount': 20 });
    expect(batch.status).toBe('paid');
    expect(batch.remittances[0]).toMatchObject({ net: 1470, withheld: 30, form2307Received: true });
  });

  it('leaves a part-paid claim open, and marks the transmittal part paid', async () => {
    const batch = fakeBatch();
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);
    vi.mocked(recordInvoicePayments).mockResolvedValue({ ok: true, invoice: {} });

    await recordRemittance({ tenantId: TENANT, batchId: String(batch._id), userId: USER, date: new Date(), form2307Received: false, lines: [{ invoiceId: String(INV_A), paid: 400, withheld: 0 }] });

    expect(batch.claims[0]).toMatchObject({ paid: 400, status: 'pending' });
    expect(vi.mocked(recordInvoicePayments).mock.calls[0][0].alsoSet).toMatchObject({ 'insurance.status': 'approved' });
    expect(batch.status).toBe('partial');
  });

  it('sends a refused claim back to the patient without posting money', async () => {
    const batch = fakeBatch();
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);

    await recordRemittance({
      tenantId: TENANT,
      batchId: String(batch._id),
      userId: USER,
      date: new Date(),
      form2307Received: false,
      lines: [{ invoiceId: String(INV_B), paid: 0, withheld: 0, denied: true, denialReason: 'Not covered' }],
    });

    expect(recordInvoicePayments).not.toHaveBeenCalled();
    expect(Invoice.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { 'insurance.status': 'rejected', 'insurance.denialReason': 'Not covered' } });
    expect(batch.claims[1].status).toBe('denied');
    expect(batch.remittances).toHaveLength(0);
  });

  it('reports a claim the invoice refused and keeps it open', async () => {
    const batch = fakeBatch();
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);
    vi.mocked(recordInvoicePayments).mockResolvedValue({ ok: false, status: 400, error: 'Payment exceeds the outstanding balance (100.00)' });

    const r = await recordRemittance({ tenantId: TENANT, batchId: String(batch._id), userId: USER, date: new Date(), form2307Received: false, lines: [{ invoiceId: String(INV_A), paid: 1000, withheld: 0 }] });

    expect(r).toMatchObject({ ok: true, posted: 0, failed: [{ invoiceNumber: 'INV-1' }] });
    expect(batch.claims[0].status).toBe('pending');
  });

  it('refuses a draft', async () => {
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(fakeBatch('draft') as any);
    const r = await recordRemittance({ tenantId: TENANT, batchId: String(new Types.ObjectId()), userId: USER, date: new Date(), form2307Received: false, lines: [] });
    expect(r).toMatchObject({ ok: false, status: 409 });
    // Refused, so the transmittal is let go again.
    expect(HmoClaimBatch.updateOne).toHaveBeenCalledWith(expect.anything(), { $unset: { postingSince: 1 } });
  });

  it('refuses while someone else is posting to the same transmittal, and posts nothing', async () => {
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(null);
    vi.mocked(HmoClaimBatch.exists).mockResolvedValue({ _id: new Types.ObjectId() } as any);
    const r = await recordRemittance({ tenantId: TENANT, batchId: String(new Types.ObjectId()), userId: USER, date: new Date(), form2307Received: false, lines: [{ invoiceId: String(INV_A), paid: 100, withheld: 0 }] });
    expect(r).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/Someone else/) });
    expect(recordInvoicePayments).not.toHaveBeenCalled();
    expect(HmoClaimBatch.updateOne).not.toHaveBeenCalled();
  });

  it('lets the transmittal go in the same save that records the payment', async () => {
    const batch = fakeBatch();
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);
    vi.mocked(recordInvoicePayments).mockResolvedValue({ ok: true, invoice: {} });
    await recordRemittance({ tenantId: TENANT, batchId: String(batch._id), userId: USER, date: new Date(), form2307Received: false, lines: [{ invoiceId: String(INV_A), paid: 400, withheld: 0 }] });
    expect((batch as any).postingSince).toBeNull();
    expect(batch.save).toHaveBeenCalled();
    expect(HmoClaimBatch.updateOne).not.toHaveBeenCalled();
  });
});

describe('closeBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks unpaid claims refused and part-paid ones short paid', async () => {
    const batch = fakeBatch('partial');
    batch.claims[0].paid = 300;
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);

    await closeBatch(TENANT, String(batch._id));

    expect(batch.claims.map((c) => c.status)).toEqual(['short_paid', 'denied']);
    expect(batch.status).toBe('closed');
  });

  it('closes the part-paid claim on its bill too, so reports stop counting it as open', async () => {
    const batch = fakeBatch('partial');
    batch.claims[0].paid = 300;
    vi.mocked(HmoClaimBatch.findOneAndUpdate).mockResolvedValue(batch as any);
    vi.mocked(Invoice.updateOne).mockClear();

    await closeBatch(TENANT, String(batch._id));

    expect(Invoice.updateOne).toHaveBeenCalledWith(
      { _id: INV_A, tenantId: expect.anything() },
      { $set: { 'insurance.status': 'paid', 'insurance.denialReason': 'Transmittal closed with the rest unpaid' } }
    );
    expect(Invoice.updateOne).toHaveBeenCalledWith(
      { _id: INV_B, tenantId: expect.anything() },
      { $set: { 'insurance.status': 'rejected', 'insurance.denialReason': 'Transmittal closed unpaid' } }
    );
  });
});

describe('claimHold', () => {
  const lean = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

  it('holds a bill whose claim waits in a sent transmittal, and frees it once answered', async () => {
    const batch = { batchNumber: 'TR-000007', hmoName: 'Maxicare', status: 'submitted', claims: [{ invoice: INV_A, status: 'pending' }] };
    vi.mocked(HmoClaimBatch.findOne).mockReturnValue(lean(batch) as any);
    const invoice = { _id: INV_A, insurance: { batch: new Types.ObjectId() } };

    expect(await claimHold(TENANT, invoice, 'refund')).toMatch(/sent to Maxicare in transmittal TR-000007.*then refund it/);

    batch.claims[0].status = 'denied';
    expect(await claimHold(TENANT, invoice, 'refund')).toBeNull();
  });

  it('asks for a draft claim to be taken out first', async () => {
    vi.mocked(HmoClaimBatch.findOne).mockReturnValue(lean({ batchNumber: 'TR-000008', hmoName: 'Intellicare', status: 'draft', claims: [{ invoice: INV_B, status: 'pending' }] }) as any);
    expect(await claimHold(TENANT, { _id: INV_B, insurance: { batch: new Types.ObjectId() } }, 'change')).toMatch(/draft transmittal TR-000008.*Take it out/);
  });

  it('never holds a bill that was never claimed', async () => {
    expect(await claimHold(TENANT, { _id: INV_A, insurance: {} }, 'change')).toBeNull();
  });
});

describe('claimInvoiceStates', () => {
  it('works out the withholding to expect at the HMO’s rates today, capped at what is left', async () => {
    const invoice = { _id: INV_A, status: 'unpaid', total: 1000, outstandingBalance: 1000, subtotal: 500, professionalFee: 500, taxBreakdown: {} };
    vi.mocked(Invoice.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve([invoice]) }) } as any);
    const claims = [{ invoice: INV_A, amount: 1000, paid: 0, withheld: 0, status: 'pending' as const }];

    // Half services at 2%, half doctor's fee at 10%: 10 + 50.
    const now = await claimInvoiceStates(new Types.ObjectId(TENANT), claims, { withholdingServicesRate: 2, withholdingProfessionalRate: 10 });
    expect(now[String(INV_A)].suggestedWithheld).toBe(60);

    // The HMO's rates changed since the claim was sent.
    const later = await claimInvoiceStates(new Types.ObjectId(TENANT), claims, { withholdingServicesRate: 1, withholdingProfessionalRate: 5 });
    expect(later[String(INV_A)].suggestedWithheld).toBe(30);

    const noRates = await claimInvoiceStates(new Types.ObjectId(TENANT), claims);
    expect(noRates[String(INV_A)].suggestedWithheld).toBeNull();
  });
});
