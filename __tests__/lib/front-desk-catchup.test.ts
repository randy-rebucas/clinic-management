import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));

const state = vi.hoisted(() => ({
  visits: [] as unknown[],
  invoices: [] as unknown[],
  prescriptions: [] as unknown[],
  settings: {} as Record<string, unknown>,
}));
const chain = (value: () => unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'limit']) q[m] = () => q;
  q.lean = async () => value();
  return q;
};
vi.mock('@/models/Visit', () => ({ default: { find: () => chain(() => state.visits) } }));
vi.mock('@/models/Invoice', () => ({ default: { find: () => chain(() => state.invoices) } }));
vi.mock('@/models/Prescription', () => ({ default: { find: () => chain(() => state.prescriptions) } }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => state.settings }));

const TENANT = new Types.ObjectId();
vi.mock('@/lib/automations/shared', async (orig) => ({
  ...(await orig<typeof import('@/lib/automations/shared')>()),
  forEachTenant: async (_id: unknown, fn: (t: unknown) => Promise<unknown>) => [
    { tenantId: String(TENANT), success: true, result: await fn({ tenantId: String(TENANT), tenantObjectId: TENANT, name: 'C', timezone: 'Asia/Manila' }) },
  ],
}));

const notifyFrontDesk = vi.fn(async (..._args: unknown[]) => 2);
vi.mock('@/lib/automations/front-desk', () => ({ notifyFrontDesk: (...args: unknown[]) => notifyFrontDesk(...args) }));

const generateInvoiceForVisit = vi.fn();
vi.mock('@/lib/automations/invoice-generation', () => ({ generateInvoiceForVisit: (o: unknown) => generateInvoiceForVisit(o) }));

import { catchUpMessage, runFrontDeskCatchUp } from '@/lib/automations/front-desk-catchup';

const visit = (code: string, firstName: string) => ({ _id: new Types.ObjectId(), visitCode: code, patient: { firstName, lastName: 'Cruz' } });

beforeEach(() => {
  notifyFrontDesk.mockClear();
  generateInvoiceForVisit.mockReset();
  state.visits = [];
  state.invoices = [];
  state.prescriptions = [];
  state.settings = {};
});

describe('catchUpMessage', () => {
  it('groups what each patient still needs', () => {
    const text = catchUpMessage([
      { patientName: 'Ana Cruz', visitCode: 'V-1', needsInvoice: true },
      { patientName: 'Ben Cruz', visitCode: 'V-2', invoice: { number: 'INV-9', due: 500 }, prescriptions: ['RX-3'] },
      { patientName: 'Cy Cruz', visitCode: 'V-3', invoice: { number: 'INV-10', due: 200, payer: 'Maxicare' } },
      { patientName: 'Done Cruz', visitCode: 'V-4' },
    ])!;
    expect(text).toMatch(/^3 patients seen since yesterday still need something/);
    expect(text).toContain('Needs an invoice:\n• Ana Cruz (V-1)');
    expect(text).toContain('• Ben Cruz (V-2) — INV-9, 500.00 due');
    expect(text).toContain('INV-10, 200.00 due (Maxicare claim: collect only the patient’s share)');
    expect(text).toContain('Medicines not handed over:\n• Ben Cruz (V-2) — RX-3');
    expect(text).not.toContain('Done Cruz');
  });

  it('counts what it does not show', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ patientName: `P${i}`, needsInvoice: true }));
    expect(catchUpMessage(many)).toContain('• …and 3 more');
  });

  it('is empty when everything is done', () => {
    expect(catchUpMessage([{ patientName: 'Ana' }])).toBeNull();
  });
});

describe('runFrontDeskCatchUp', () => {
  it('makes a missing invoice, then lists only what is still open', async () => {
    const [a, b, c] = [visit('V-1', 'Ana'), visit('V-2', 'Ben'), visit('V-3', 'Cy')];
    state.visits = [a, b, c];
    state.invoices = [
      { visit: b._id, invoiceNumber: 'INV-2', status: 'paid', outstandingBalance: 0 },
      { visit: c._id, invoiceNumber: 'INV-3', status: 'partial', outstandingBalance: 150 },
    ];
    state.prescriptions = [{ visit: b._id, prescriptionCode: 'RX-2' }];
    generateInvoiceForVisit.mockResolvedValue({ success: true, invoice: { invoiceNumber: 'INV-1', status: 'unpaid', outstandingBalance: 400 } });

    const result = await runFrontDeskCatchUp();
    expect(generateInvoiceForVisit).toHaveBeenCalledTimes(1);
    expect(generateInvoiceForVisit.mock.calls[0][0]).toMatchObject({ visitId: a._id, sendEmail: false, sendNotification: false });
    expect(result).toMatchObject({ visits: 3, invoicesMade: 1, needsInvoice: 0, unpaid: 2, undispensed: 1, notified: 2 });

    const [, notice] = notifyFrontDesk.mock.calls[0] as [unknown, { message: string; actionUrl: string }];
    expect(notice.message).toContain('Ana Cruz (V-1) — INV-1, 400.00 due');
    expect(notice.message).toContain('Cy Cruz (V-3) — INV-3, 150.00 due');
    expect(notice.message).toContain('Ben Cruz (V-2) — RX-2');
    expect(notice.actionUrl).toBe('/invoices?status=open');
  });

  it('lists the visit as needing an invoice when auto-billing is off', async () => {
    state.visits = [visit('V-1', 'Ana')];
    state.settings = { automationSettings: { autoInvoiceGeneration: false } };
    const result = await runFrontDeskCatchUp();
    expect(generateInvoiceForVisit).not.toHaveBeenCalled();
    expect(result.needsInvoice).toBe(1);
    expect((notifyFrontDesk.mock.calls[0][1] as { message: string }).message).toContain('Needs an invoice:\n• Ana Cruz (V-1)');
  });

  it('sends nothing when every visit is settled', async () => {
    const a = visit('V-1', 'Ana');
    state.visits = [a];
    state.invoices = [{ visit: a._id, invoiceNumber: 'INV-1', status: 'paid' }];
    const result = await runFrontDeskCatchUp();
    expect(result.notified).toBe(0);
    expect(notifyFrontDesk).not.toHaveBeenCalled();
  });
});
