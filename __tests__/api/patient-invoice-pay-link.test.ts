import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn(async () => null), rateLimiters: { api: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({ clinicName: 'Sunrise Clinic', billingSettings: { currency: 'PHP' } })) }));
vi.mock('@/lib/payments/accounts', () => ({ invoicePayOptions: vi.fn() }));
vi.mock('@/lib/payments/invoice-pay', () => ({
  MIN_ONLINE_AMOUNT: 20,
  createPayPageToken: vi.fn((t: string, i: string, a?: string | null) => ({ token: `tok.${t}.${i}.${a || 'any'}`, expiresAt: new Date('2026-12-01T00:00:00Z') })),
}));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { findOne: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { createAuditLog } from '@/lib/audit';
import { invoicePayOptions } from '@/lib/payments/accounts';
import { createPayPageToken } from '@/lib/payments/invoice-pay';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import { GET, POST } from '@/app/api/patients/me/invoices/[id]/pay-link/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const INVOICE_ID = '507f1f77bcf86cd799439044';

const patientQuery = (patient: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(patient) }) });
const invoiceQuery = (row: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(row) };
  q.select = vi.fn().mockReturnValue(q);
  return q;
};
const openInvoice = {
  _id: new Types.ObjectId(INVOICE_ID),
  tenantId: new Types.ObjectId(TENANT_A),
  patient: new Types.ObjectId(PATIENT_ID),
  invoiceNumber: 'INV-0042',
  status: 'partial',
  total: 800,
  outstandingBalance: 300,
};
const call = (handler: typeof GET, id = INVOICE_ID) =>
  handler(new NextRequest(`http://localhost/api/patients/me/invoices/${id}/pay-link`, { method: handler === GET ? 'GET' : 'POST' }), {
    params: Promise.resolve({ id }),
  });

describe('patient invoice pay link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', email: 'p@x.y' } as any);
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A] }) as any);
    vi.mocked(Invoice.findOne).mockReturnValue(invoiceQuery(openInvoice));
    vi.mocked(invoicePayOptions).mockResolvedValue({ accounts: [{ _id: 'a1', provider: 'paymongo' }] as any, defaultId: 'a1' });
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await call(POST)).status).toBe(401);
    expect(createPayPageToken).not.toHaveBeenCalled();
  });

  it("404 for someone else's invoice, looked up only among the patient's own at their clinics", async () => {
    vi.mocked(Invoice.findOne).mockReturnValue(invoiceQuery(null));
    expect((await call(POST)).status).toBe(404);
    expect(vi.mocked(Invoice.findOne).mock.calls[0][0]).toEqual({
      _id: INVOICE_ID,
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
    });
    expect(createPayPageToken).not.toHaveBeenCalled();
  });

  it('GET says whether the app can offer to pay', async () => {
    const body = await (await call(GET)).json();
    expect(body.data).toMatchObject({ offered: true, code: null, amount: 300, methods: ['online'] });
    expect(invoicePayOptions).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ invoiceNumber: 'INV-0042' }));
  });

  it("POST mints the staff route's signed link for the invoice's clinic, and audits it", async () => {
    const res = await call(POST);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(createPayPageToken).toHaveBeenCalledWith(TENANT_A, INVOICE_ID, null);
    expect(body.data).toMatchObject({ amount: 300, url: expect.stringMatching(new RegExp(`/pay/tok\.${TENANT_A}\.${INVOICE_ID}\.any$`)) });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PATIENT_ID, userRole: 'patient', tenantId: TENANT_A, resource: 'invoice', resourceId: INVOICE_ID, dataSubject: openInvoice.patient })
    );
  });

  it('a guardian acting for a family member is audited as themselves', async () => {
    const GUARDIAN = '507f1f77bcf86cd799439099';
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, guardianId: GUARDIAN, type: 'patient', email: 'g@x.y' } as any);
    expect((await call(POST)).status).toBe(200);
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({ userId: GUARDIAN, description: expect.stringContaining('family member') });
  });

  it('409 with a code when there is nothing to pay or no way to pay it', async () => {
    vi.mocked(Invoice.findOne).mockReturnValue(invoiceQuery({ ...openInvoice, status: 'paid', outstandingBalance: 0 }));
    let res = await call(POST);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOTHING_OWED');
    // Settled invoices don't look up the clinic's accounts.
    expect(invoicePayOptions).not.toHaveBeenCalled();

    vi.mocked(Invoice.findOne).mockReturnValue(invoiceQuery(openInvoice));
    vi.mocked(invoicePayOptions).mockResolvedValue({ accounts: [], defaultId: null });
    res = await call(POST);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NO_PAYMENT_OPTION');

    vi.mocked(Invoice.findOne).mockReturnValue(invoiceQuery({ ...openInvoice, outstandingBalance: 10 }));
    vi.mocked(invoicePayOptions).mockResolvedValue({ accounts: [{ _id: 'a1', provider: 'maya' }] as any, defaultId: 'a1' });
    res = await call(POST);
    expect((await res.json()).code).toBe('BELOW_MINIMUM');
    expect(createPayPageToken).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
