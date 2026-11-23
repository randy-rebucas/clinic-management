import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/VoucherPurchase', () => ({ default: { findById: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/ActivationCode', () => ({ default: { create: vi.fn(), findOne: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/VoucherBatch', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('@/lib/emcr/account', () => ({ findAccountForSession: vi.fn() }));
vi.mock('@/lib/email', () => ({ isEmailConfigured: vi.fn(() => true), sendEmail: vi.fn().mockResolvedValue({ success: true }), escapeHtml: (v: unknown) => String(v) }));
vi.mock('@/lib/platform-config', () => ({ getPlatformFees: vi.fn() }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn(), paidTotal: vi.fn(), retrieveCheckoutSession: vi.fn() }));

import { Types } from 'mongoose';
import VoucherPurchase from '@/models/VoucherPurchase';
import ActivationCode from '@/models/ActivationCode';
import { sendEmail } from '@/lib/email';
import { encryptData } from '@/lib/encryption';
import { hashActivationCode } from '@/lib/emcr/activation';
import { applyVoucherPurchasePayment } from '@/lib/emcr/voucher-purchase';

const PURCHASE = new Types.ObjectId('507f1f77bcf86cd799439055');
const CODE_ID = new Types.ObjectId('507f1f77bcf86cd799439066');
const CODE = 'ABCDEFGHJKMN';
const meta = { purpose: 'emcr-voucher', purchaseId: String(PURCHASE) };

const lean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });
const pending = (over: Record<string, unknown> = {}) => ({
  _id: PURCHASE,
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
  email: 'buyer@example.com',
  amount: 80,
  days: 365,
  status: 'pending',
  checkoutSessionId: 'cs_1',
  codeEncrypted: encryptData(CODE),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(VoucherPurchase.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
});

describe('applyVoucherPurchasePayment', () => {
  it('writes the code row, marks the purchase paid and emails the code', async () => {
    vi.mocked(VoucherPurchase.findById).mockReturnValue(lean(pending()) as any);
    vi.mocked(ActivationCode.create).mockResolvedValue({ _id: CODE_ID } as any);

    const r = await applyVoucherPurchasePayment(meta, 80, 'pay_1', 'cs_1');

    expect(r).toEqual({ ok: true, applied: true });
    expect(ActivationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ codeHash: hashActivationCode(CODE), last4: 'JKMN', purchaseId: PURCHASE, status: 'unsold' })
    );
    expect(VoucherPurchase.updateOne).toHaveBeenCalledWith(
      { _id: PURCHASE, status: 'pending' },
      { $set: expect.objectContaining({ status: 'paid', paymentId: 'pay_1', paidAmount: 80, activationCodeId: CODE_ID }) }
    );
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'buyer@example.com', text: expect.stringContaining('ABCD-EFGH-JKMN') }));
  });

  it('does nothing for a purchase already paid', async () => {
    vi.mocked(VoucherPurchase.findById).mockReturnValue(lean(pending({ status: 'paid' })) as any);
    expect(await applyVoucherPurchasePayment(meta, 80, 'pay_1', 'cs_1')).toEqual({ ok: true, applied: false });
    expect(ActivationCode.create).not.toHaveBeenCalled();
  });

  it('a second delivery racing the first reuses the code row and sends no second email', async () => {
    vi.mocked(VoucherPurchase.findById).mockReturnValue(lean(pending()) as any);
    vi.mocked(ActivationCode.create).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    vi.mocked(ActivationCode.findOne).mockReturnValue(lean({ _id: CODE_ID, purchaseId: PURCHASE }) as any);
    vi.mocked(VoucherPurchase.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);

    expect(await applyVoucherPurchasePayment(meta, 80, 'pay_1', 'cs_1')).toEqual({ ok: true, applied: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses an underpayment and a payment from another checkout', async () => {
    vi.mocked(VoucherPurchase.findById).mockReturnValue(lean(pending()) as any);
    expect(await applyVoucherPurchasePayment(meta, 50, 'pay_1', 'cs_1')).toMatchObject({ ok: false, retry: false });
    expect(await applyVoucherPurchasePayment(meta, 80, 'pay_1', 'cs_other')).toMatchObject({ ok: false, retry: false });
    expect(ActivationCode.create).not.toHaveBeenCalled();
  });

  it('refuses metadata without a purchase', async () => {
    expect(await applyVoucherPurchasePayment({ purpose: 'emcr-voucher' }, 80, 'pay_1', 'cs_1')).toMatchObject({ ok: false });
  });
});
