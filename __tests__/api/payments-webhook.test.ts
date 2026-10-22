import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({ getPlatformPaymongoKeys: vi.fn(), isPlatformPaymongoReady: vi.fn() }));
vi.mock('@/models/PaymentAccount', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/payments/accounts', () => ({ loadCredentials: vi.fn(async () => ({ secretKey: 'sk_test_1', webhookSecret: 'whsk_right' })) }));
const applyAccountEvent = vi.fn(async () => ({ ok: true, detail: 'payment recorded' }));
const accountForWebhook = vi.fn();
vi.mock('@/lib/payments/invoice-pay', () => ({ accountForWebhook: (...a: unknown[]) => accountForWebhook(...a), applyAccountEvent: (...a: unknown[]) => applyAccountEvent(...(a as [])) }));

import { POST } from '@/app/api/payments/webhook/[provider]/[token]/route';

const body = JSON.stringify({ data: { attributes: { type: 'checkout_session.payment.paid', livemode: false, data: { id: 'cs_123' } } } });
function signed(secret: string) {
  const t = Math.floor(Date.now() / 1000);
  const te = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return new NextRequest('http://localhost/api/payments/webhook/paymongo/tok', { method: 'POST', body, headers: { 'paymongo-signature': `t=${t},te=${te}` } });
}
const ctx = { params: Promise.resolve({ provider: 'paymongo', token: 'a'.repeat(32) }) };

describe('POST /api/payments/webhook/[provider]/[token]', () => {
  beforeEach(() => {
    applyAccountEvent.mockClear();
    accountForWebhook.mockResolvedValue({ _id: 'acct1', provider: 'paymongo', secretKeyEnc: 'x' });
  });

  it('applies a notice signed with this account’s own secret', async () => {
    const res = await POST(signed('whsk_right'), ctx);
    expect(res.status).toBe(200);
    expect(applyAccountEvent).toHaveBeenCalledWith(expect.anything(), { kind: 'paid', checkoutId: 'cs_123' });
  });

  it('refuses a notice signed with any other secret (another clinic’s, the platform’s)', async () => {
    expect((await POST(signed('whsk_other'), ctx)).status).toBe(401);
    expect(applyAccountEvent).not.toHaveBeenCalled();
  });

  it('answers the same for an unknown account', async () => {
    accountForWebhook.mockResolvedValue(null);
    expect((await POST(signed('whsk_right'), ctx)).status).toBe(401);
  });
});
