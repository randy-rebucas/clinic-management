import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));

const state = vi.hoisted(() => ({
  visit: null as unknown,
  invoice: null as unknown,
  prescriptions: [] as unknown[],
  frontDesk: ['r1'] as string[],
}));
const chain = (value: () => unknown) => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.populate = () => q;
  q.lean = async () => value();
  return q;
};
vi.mock('@/models/Visit', () => ({ default: { findOne: () => chain(() => state.visit) } }));
vi.mock('@/models/Invoice', () => ({ default: { findOne: () => chain(() => state.invoice) } }));
vi.mock('@/models/Prescription', () => ({ default: { find: () => chain(() => state.prescriptions) } }));

const notifyStaff = vi.fn(async (_opts: Record<string, any>) => ({ recipients: 1, batchId: 'b' }));
vi.mock('@/lib/notify', () => ({
  notifyStaff: (opts: Record<string, any>) => notifyStaff(opts),
  resolveStaffAudience: async () => state.frontDesk,
}));

import { medicationLine, notifyFrontDeskOfClosedVisit, notifyFrontDeskToDispense } from '@/lib/automations/front-desk';

const TENANT = new Types.ObjectId();
const VISIT = new Types.ObjectId();
const PATIENT = new Types.ObjectId();
const INVOICE = new Types.ObjectId();
const RX = new Types.ObjectId();

beforeEach(() => {
  notifyStaff.mockClear();
  state.visit = { visitCode: 'V-0007', patient: { _id: PATIENT, firstName: 'Ana', lastName: 'Cruz' }, provider: { name: 'Dr. Reyes' } };
  state.invoice = null;
  state.prescriptions = [];
  state.frontDesk = ['r1'];
});

describe('notifyFrontDeskOfClosedVisit', () => {
  it('sends receptionists to the unpaid invoice, not the doctor who closed it', async () => {
    state.invoice = { _id: INVOICE, invoiceNumber: 'INV-0042', status: 'unpaid', outstandingBalance: 500 };
    await notifyFrontDeskOfClosedVisit({ visitId: VISIT, tenantId: TENANT, closedBy: 'doc1' });
    const opts = notifyStaff.mock.calls[0][0];
    expect(opts.audience).toEqual({ roles: ['receptionist'] });
    expect(opts.actionUrl).toBe(`/invoices/${INVOICE}`);
    expect(opts.message).toContain('INV-0042');
    expect(opts.message).toContain('500.00 due');
    expect(opts.excludeUserId).toBe('doc1');
    expect(opts.priority).toBe('high');
  });

  it('asks for an invoice when none was made', async () => {
    await notifyFrontDeskOfClosedVisit({ visitId: VISIT, tenantId: TENANT });
    const opts = notifyStaff.mock.calls[0][0];
    expect(opts.title).toMatch(/needs an invoice/);
    expect(opts.actionUrl).toBe(`/invoices/new?patientId=${PATIENT}&visitId=${VISIT}`);
  });

  it('falls back to admins when the clinic has no receptionist', async () => {
    state.frontDesk = [];
    await notifyFrontDeskOfClosedVisit({ visitId: VISIT, tenantId: TENANT });
    expect(notifyStaff.mock.calls[0][0].audience).toEqual({ roles: ['admin', 'owner'] });
  });

  it('stays quiet when the bill is already settled', async () => {
    state.invoice = { _id: INVOICE, invoiceNumber: 'INV-0042', status: 'paid', outstandingBalance: 0 };
    await expect(notifyFrontDeskOfClosedVisit({ visitId: VISIT, tenantId: TENANT })).resolves.toEqual({ recipients: 0 });
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});

describe('notifyFrontDeskToDispense', () => {
  const amox = { name: 'Amoxicillin', strength: '500 mg', form: 'capsule', quantity: 21, instructions: '1 capsule three times a day for 7 days' };
  const para = { name: 'Paracetamol', strength: '500 mg', quantity: 10, dose: '1 tablet', frequency: 'every 6 hours as needed' };

  it('lists what to give, the allergies and the steps, and links the prescription', async () => {
    (state.visit as any).patient.allergies = ['Penicillin', { substance: 'Sulfa' }];
    state.prescriptions = [{ _id: RX, prescriptionCode: 'RX-0012', status: 'active', medications: [amox, para] }];
    await notifyFrontDeskToDispense({ visitId: VISIT, tenantId: TENANT, closedBy: 'doc1' });
    const opts = notifyStaff.mock.calls[0][0];
    expect(opts.type).toBe('prescription');
    expect(opts.title).toBe('Medicines to hand over — Ana Cruz');
    expect(opts.actionUrl).toBe(`/prescriptions/${RX}`);
    expect(opts.excludeUserId).toBe('doc1');
    expect(opts.message).toContain('RX-0012 from Dr. Reyes');
    expect(opts.message).toContain('• Amoxicillin 500 mg capsule — give 21 — 1 capsule three times a day for 7 days');
    expect(opts.message).toContain('• Paracetamol 500 mg — give 10 — 1 tablet every 6 hours as needed');
    expect(opts.message).toContain('Allergies on file: Penicillin, Sulfa');
    expect(opts.message).toContain('press Dispense');
  });

  it('only lists what is still to give on a partly dispensed prescription', async () => {
    state.prescriptions = [{
      _id: RX, prescriptionCode: 'RX-0012', status: 'partially-dispensed', medications: [amox, para],
      pharmacyDispenses: [{ items: [{ medicationIndex: 0, quantity: 21 }, { medicationIndex: 1, quantity: 4 }] }],
    }];
    await notifyFrontDeskToDispense({ visitId: VISIT, tenantId: TENANT });
    const { message } = notifyStaff.mock.calls[0][0];
    expect(message).not.toContain('Amoxicillin');
    expect(message).toContain('Paracetamol 500 mg — give 6');
  });

  it('sends nothing when the visit has no open prescription', async () => {
    await expect(notifyFrontDeskToDispense({ visitId: VISIT, tenantId: TENANT })).resolves.toEqual({ recipients: 0 });
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it('flags a medicine without a quantity instead of guessing', () => {
    expect(medicationLine({ name: 'Cetirizine' }, null)).toBe('• Cetirizine — quantity not set — ask the doctor — as directed');
  });
});
