import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/platform-auth', () => ({
  requirePlatformApi: vi.fn(),
  isPlatformError: (v: unknown) => v instanceof NextResponse,
}));
vi.mock('@/models/VoucherPurchase', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/lib/emcr/voucher-purchase', () => ({ checkPendingPayment: vi.fn(), emailVoucherCode: vi.fn() }));

import { GET, POST } from '@/app/api/platform/vouchers/online/[id]/route';
import { requirePlatformApi } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import VoucherPurchase from '@/models/VoucherPurchase';
import { checkPendingPayment, emailVoucherCode } from '@/lib/emcr/voucher-purchase';
import { encryptData } from '@/lib/encryption';

const ID = '507f1f77bcf86cd799439055';
const ctx = { params: Promise.resolve({ id: ID }) };
const url = `http://localhost/api/platform/vouchers/online/${ID}`;
const post = (body: unknown) => POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), ctx);
const found = (doc: unknown) => vi.mocked(VoucherPurchase.findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) }) } as any);
const paid = { _id: ID, status: 'paid', email: 'buyer@example.com', token: 'tok', codeEncrypted: encryptData('ABCDEFGHJKMN') };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformApi).mockResolvedValue({ email: 'admin@devcom.ph' } as any);
});

describe('GET /api/platform/vouchers/online/[id]', () => {
  it('refuses without a platform session', async () => {
    vi.mocked(requirePlatformApi).mockResolvedValue(NextResponse.json({}, { status: 401 }) as any);
    expect((await GET(new NextRequest(url), ctx)).status).toBe(401);
  });

  it('reveals a paid code and audits it', async () => {
    found(paid);
    const res = await GET(new NextRequest(url), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.code).toBe('ABCD-EFGH-JKMN');
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ userEmail: 'admin@devcom.ph', action: 'read' }));
  });

  it('has no code for an unpaid checkout', async () => {
    found({ ...paid, status: 'pending' });
    expect((await GET(new NextRequest(url), ctx)).status).toBe(409);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

describe('POST /api/platform/vouchers/online/[id]', () => {
  it('resends to a corrected address and keeps it', async () => {
    found(paid);
    vi.mocked(emailVoucherCode).mockResolvedValue(true);
    const res = await post({ action: 'resend', email: 'Fixed@Example.com' });
    expect(res.status).toBe(200);
    expect(emailVoucherCode).toHaveBeenCalledWith(ID, 'fixed@example.com', 'ABCDEFGHJKMN', 'tok');
    expect(VoucherPurchase.updateOne).toHaveBeenCalledWith({ _id: ID }, { $set: { email: 'fixed@example.com' } });
    expect(createAuditLog).toHaveBeenCalled();
  });

  it('says so when the email could not go out, and keeps the old address', async () => {
    found(paid);
    vi.mocked(emailVoucherCode).mockResolvedValue(false);
    expect((await post({ action: 'resend', email: 'new@example.com' })).status).toBe(502);
    expect(VoucherPurchase.updateOne).not.toHaveBeenCalled();
  });

  it('will not resend for an unpaid checkout', async () => {
    found({ ...paid, status: 'pending' });
    expect((await post({ action: 'resend' })).status).toBe(409);
    expect(emailVoucherCode).not.toHaveBeenCalled();
  });

  it('checks PayMongo for a pending checkout', async () => {
    found({ ...paid, status: 'pending', checkoutSessionId: 'cs_1' });
    vi.mocked(checkPendingPayment).mockResolvedValue({ state: 'unpaid', checkoutStatus: 'expired' });
    const res = await post({ action: 'check' });
    expect((await res.json()).data).toEqual({ status: 'unpaid', checkoutStatus: 'expired' });
  });

  it('rejects an unknown action', async () => {
    found(paid);
    expect((await post({ action: 'delete' })).status).toBe(400);
  });
});
