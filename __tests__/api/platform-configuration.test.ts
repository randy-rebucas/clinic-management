import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/platform-auth', () => ({
  requirePlatformApi: vi.fn(),
  isPlatformError: (v: unknown) => v instanceof NextResponse,
}));
vi.mock('@/lib/paymongo', () => ({ testPaymongoKey: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({
  getBillingIssuer: vi.fn(async () => null),
  getPlanPricing: vi.fn(),
  getPlatformFees: vi.fn(),
  lastIssuedSerial: vi.fn(async () => 0),
  savePlatformSection: vi.fn(),
}));
vi.mock('@/lib/platform-config-page', () => ({ loadPlatformConfig: vi.fn(async () => ({ ok: true })) }));

import { PUT } from '@/app/api/platform/configuration/route';
import { requirePlatformApi } from '@/lib/platform-auth';
import { testPaymongoKey } from '@/lib/paymongo';
import { lastIssuedSerial, savePlatformSection } from '@/lib/platform-config';

const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/platform/configuration', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

const ISSUER = {
  sellerName: 'DevCom Digital',
  tin: '123-456-789',
  branchCode: '00000',
  address: 'Cebu City, Philippines',
  vatRegime: 'non_vat',
  permitNumber: 'ATP-1',
  serialPrefix: 'MCS',
  serialStart: 1,
  serialEnd: 500,
};

describe('PUT /api/platform/configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformApi).mockResolvedValue({ email: 'admin@devcom.ph' });
  });

  it('refuses anyone without a platform session', async () => {
    vi.mocked(requirePlatformApi).mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await put({ section: 'fees', values: {} })).status).toBe(401);
    expect(savePlatformSection).not.toHaveBeenCalled();
  });

  it('saves a valid issuer, and refuses a range that ends before serials already issued', async () => {
    expect((await put({ section: 'billing-issuer', values: ISSUER })).status).toBe(200);
    expect(savePlatformSection).toHaveBeenCalledWith('billing-issuer', expect.objectContaining({ sellerName: 'DevCom Digital' }), 'admin@devcom.ph');

    vi.mocked(lastIssuedSerial).mockResolvedValue(600);
    const res = await put({ section: 'billing-issuer', values: ISSUER });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.serialEnd).toMatch(/MCS-0*600 is already issued/);
  });

  it('checks a PayMongo key with PayMongo before saving it', async () => {
    vi.mocked(testPaymongoKey).mockResolvedValue({ ok: false, error: 'PayMongo refused this key.' });
    const res = await put({ section: 'paymongo', values: { secretKey: 'sk_live_bad' } });
    expect(res.status).toBe(400);
    expect(savePlatformSection).not.toHaveBeenCalled();

    vi.mocked(testPaymongoKey).mockResolvedValue({ ok: true, mode: 'live' });
    expect((await put({ section: 'paymongo', values: { secretKey: 'sk_live_good' } })).status).toBe(200);
    expect(savePlatformSection).toHaveBeenCalledWith('paymongo', {}, 'admin@devcom.ph', { set: { secretKey: 'sk_live_good' } });
  });

  it('validates prices and fees', async () => {
    expect((await put({ section: 'pricing', values: { monthly: { basic: 5, professional: 100, enterprise: 200 }, yearlyMonths: 10 } })).status).toBe(400);
    expect((await put({ section: 'fees', values: { medrepActivationFee: 0, voucherFaceValue: 50, voucherWholesalePrice: 70 } })).status).toBe(400);
    expect((await put({ section: 'fees', values: { medrepActivationFee: 0, voucherFaceValue: 80, voucherWholesalePrice: 60 } })).status).toBe(200);
  });
});
