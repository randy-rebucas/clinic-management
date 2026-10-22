import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({ clinicName: 'Sunrise Clinic' })) }));
vi.mock('@/lib/encryption', () => ({ encryptData: (v: string) => `enc:${v}`, decryptData: (v: string) => v.replace(/^enc:/, '') }));
vi.mock('@/app/lib/dal', () => ({ deriveKey: (p: string) => Buffer.from(`test-key-${p}`) }));
vi.mock('@/app/lib/auth-helpers', () => ({ isAdmin: (s: { role?: string }) => s.role === 'admin' }));
vi.mock('@/lib/doctor-access', () => ({ myDoctorProfileId: vi.fn(async () => null) }));
vi.mock('@/models/Doctor', () => ({ default: { exists: vi.fn(async () => true), find: vi.fn() } }));
vi.mock('@/lib/invoice-payments', () => ({ recordInvoicePayments: vi.fn(async () => ({ ok: true, invoice: {} })) }));

const accounts: any[] = [];
vi.mock('@/models/PaymentAccount', async () => {
  const providers = await import('@/lib/payments/providers');
  return {
    ...providers,
    default: {
      find: vi.fn(() => ({ select: async () => accounts.filter((a) => a.enabled) })),
      findOne: vi.fn(() => ({ select: async () => null })),
    },
  };
});

const invoiceDoc: any = {};
vi.mock('@/models/Invoice', () => ({
  default: {
    findOne: vi.fn(() => {
      const q: any = { select: () => q, populate: () => q, lean: async () => ({ ...invoiceDoc }) };
      return q;
    }),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

const retrieveCheckout = vi.fn();
vi.mock('@/lib/payments/registry', () => ({
  adapterFor: () => ({ provider: 'paymongo', retrieveCheckout, createCheckout: vi.fn(async () => ({ id: 'cs_1', url: 'https://pay/cs_1' })) }),
}));

import { invoicePayOptions, toPublic, canManage } from '@/lib/payments/accounts';
import { applyAccountEvent, createPayPageToken, decidePaymentClaim, readPayPageToken } from '@/lib/payments/invoice-pay';
import { recordInvoicePayments } from '@/lib/invoice-payments';
import Invoice from '@/models/Invoice';

const TENANT = new Types.ObjectId();
const DOCTOR = new Types.ObjectId();
const acct = (o: Partial<any>) => ({ _id: new Types.ObjectId(), tenantId: TENANT, enabled: true, isDefault: false, ownerType: 'clinic', provider: 'manual_qr', label: 'x', ...o });

describe('which account an invoice is paid into', () => {
  beforeEach(() => (accounts.length = 0));

  it('the doctor’s own account comes first for their professional fee, then the clinic’s default', async () => {
    const clinicDefault = acct({ isDefault: true, label: 'Clinic GCash' });
    const clinicOther = acct({ label: 'Clinic bank', provider: 'bank_transfer' });
    const doctors = acct({ ownerType: 'doctor', doctorId: DOCTOR, isDefault: true, label: 'Dr PayMongo', provider: 'paymongo', secretKeyEnc: 'enc:sk_test_x' });
    accounts.push(clinicOther, clinicDefault, doctors);

    const withPf = await invoicePayOptions(TENANT, { professionalFeeDoctor: DOCTOR });
    expect(withPf.accounts.map((a) => a.label)).toEqual(['Dr PayMongo', 'Clinic GCash', 'Clinic bank']);
    expect(withPf.defaultId).toBe(String(doctors._id));
  });

  it('an online account without a stored key is never offered; none at all means no default', async () => {
    accounts.push(acct({ provider: 'paymongo', isDefault: true }));
    expect((await invoicePayOptions(TENANT, {})).accounts).toHaveLength(0);
    expect((await invoicePayOptions(TENANT, {})).defaultId).toBeNull();
  });
});

describe('account views and permissions', () => {
  it('never carries a secret', () => {
    const v = toPublic({ ...acct({ provider: 'paymongo', webhookToken: 'tok' }), secretKeyEnc: 'enc:sk_live_secret', webhookSecretEnc: 'enc:whsk', secretLast4: 'cret', webhookSecretSet: true });
    expect(JSON.stringify(v)).not.toMatch(/sk_live|whsk|enc:/);
    expect(v).toMatchObject({ secretLast4: 'cret', webhookSecretSet: true, online: true });
    expect(v.webhookUrl).toMatch(/\/api\/payments\/webhook\/paymongo\/tok$/);
  });

  it('only admins manage the clinic’s accounts; a doctor only their own', async () => {
    expect(await canManage({ role: 'receptionist', userId: 'u' }, String(TENANT), 'clinic')).toMatchObject({ ok: false, status: 403 });
    expect(await canManage({ role: 'admin', userId: 'u' }, String(TENANT), 'clinic')).toEqual({ ok: true, doctorId: null });
    const { myDoctorProfileId } = await import('@/lib/doctor-access');
    vi.mocked(myDoctorProfileId).mockResolvedValue(String(DOCTOR));
    expect(await canManage({ role: 'doctor', userId: 'u' }, String(TENANT), 'doctor')).toEqual({ ok: true, doctorId: String(DOCTOR) });
    expect(await canManage({ role: 'doctor', userId: 'u' }, String(TENANT), 'doctor', String(new Types.ObjectId()))).toMatchObject({ ok: false, status: 403 });
  });
});

describe('pay page links', () => {
  it('round-trip, and refuse a tampered or expired token', () => {
    const inv = String(new Types.ObjectId());
    const { token } = createPayPageToken(String(TENANT), inv, null);
    expect(readPayPageToken(token)).toEqual({ tenantId: String(TENANT), invoiceId: inv, accountId: null });
    expect(readPayPageToken(token.slice(0, -2) + 'xx')).toBeNull();
    const other = createPayPageToken(String(new Types.ObjectId()), inv, null).token;
    expect(readPayPageToken(`${other.split('.')[0]}.${token.split('.')[1]}`)).toBeNull();
  });
});

describe('a provider’s notice', () => {
  const account: any = { ...acct({ provider: 'paymongo', label: 'Clinic PayMongo' }), secretKeyEnc: 'enc:sk_test_1' };
  beforeEach(() => {
    vi.mocked(recordInvoicePayments).mockClear();
    Object.assign(invoiceDoc, { _id: new Types.ObjectId(), invoiceNumber: 'INV-1', payments: [] });
  });

  it('records the provider’s amount when everything matches', async () => {
    retrieveCheckout.mockResolvedValue({ id: 'cs_1', paid: 500, paymentId: 'pay_1', method: 'gcash', metadata: { tenantId: String(TENANT), accountId: String(account._id), invoiceId: String(invoiceDoc._id) } });
    expect(await applyAccountEvent(account, { kind: 'paid', checkoutId: 'cs_1' })).toEqual({ ok: true, detail: 'payment recorded' });
    expect(recordInvoicePayments).toHaveBeenCalledWith(expect.objectContaining({ payments: [expect.objectContaining({ amount: 500, referenceNo: 'pay_1', accountId: account._id })] }));
  });

  it('ignores a checkout made for another clinic, account or invoice', async () => {
    retrieveCheckout.mockResolvedValue({ id: 'cs_1', paid: 500, paymentId: 'pay_1', metadata: { tenantId: String(new Types.ObjectId()), accountId: String(account._id), invoiceId: String(invoiceDoc._id) } });
    expect(await applyAccountEvent(account, { kind: 'paid', checkoutId: 'cs_1' })).toEqual({ ok: true, detail: 'checkout details do not match' });
    expect(recordInvoicePayments).not.toHaveBeenCalled();
  });

  it('a repeated notice records nothing twice', async () => {
    invoiceDoc.payments = [{ referenceNo: 'pay_1' }];
    retrieveCheckout.mockResolvedValue({ id: 'cs_1', paid: 500, paymentId: 'pay_1', metadata: { tenantId: String(TENANT), accountId: String(account._id), invoiceId: String(invoiceDoc._id) } });
    expect(await applyAccountEvent(account, { kind: 'paid', checkoutId: 'cs_1' })).toEqual({ ok: true, detail: 'already recorded' });
    expect(recordInvoicePayments).not.toHaveBeenCalled();
  });
});

describe('patient claims', () => {
  it('a claim already decided is not recorded again', async () => {
    vi.mocked(Invoice.findOneAndUpdate).mockReturnValue({ select: () => ({ lean: async () => null }) } as any);
    const r = await decidePaymentClaim({ tenantId: String(TENANT), invoiceId: String(new Types.ObjectId()), claimId: String(new Types.ObjectId()), action: 'confirm', userId: String(new Types.ObjectId()) });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(recordInvoicePayments).not.toHaveBeenCalled();
  });
});
