import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform-config', () => ({ getPlatformPaymongoKeys: vi.fn(), isPlatformPaymongoReady: vi.fn() }));

import { xenditAdapter } from '@/lib/payments/xendit';
import { mayaAdapter } from '@/lib/payments/maya';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

describe('Xendit', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const creds = { secretKey: 'xnd_development_abc', webhookSecret: 'tok_right' };
  const body = JSON.stringify({ event: 'payment_session.completed', data: { payment_session_id: 'ps-123' } });

  it('accepts a notice only with this account’s verification token', () => {
    expect(xenditAdapter.verifyEvent(creds, body, new Headers({ 'x-callback-token': 'tok_right' }))).toEqual({ kind: 'paid', checkoutId: 'ps-123' });
    expect(xenditAdapter.verifyEvent(creds, body, new Headers({ 'x-callback-token': 'tok_wrong' }))).toBeNull();
    expect(xenditAdapter.verifyEvent(creds, body, new Headers())).toBeNull();
    expect(xenditAdapter.verifyEvent({ secretKey: 'x' }, body, new Headers({ 'x-callback-token': 'anything' }))).toBeNull();
  });

  it('counts a session as paid only when it is COMPLETED with a payment', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { status: 'COMPLETED', amount: 750, payment_id: 'py-1', metadata: { invoiceId: 'i' } }));
    expect(await xenditAdapter.retrieveCheckout(creds, 'ps-123')).toEqual({ id: 'ps-123', paid: 750, paymentId: 'py-1', metadata: { invoiceId: 'i' } });
    fetchMock.mockResolvedValueOnce(reply(200, { status: 'ACTIVE', amount: 750 }));
    expect((await xenditAdapter.retrieveCheckout(creds, 'ps-123')).paid).toBe(0);
  });

  it('creates a PH payment-link session in pesos', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { payment_session_id: 'ps-9', payment_link_url: 'https://checkout/ps-9' }));
    const r = await xenditAdapter.createCheckout(creds, { amount: 500, name: 'n', description: 'd', reference: 'INV-1', successUrl: 'https://a', cancelUrl: 'https://b', metadata: { invoiceId: 'i' } });
    expect(r).toEqual({ id: 'ps-9', url: 'https://checkout/ps-9' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ session_type: 'PAY', mode: 'PAYMENT_LINK', amount: 500, currency: 'PHP', country: 'PH', metadata: { invoiceId: 'i' } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.xendit.co/sessions');
  });
});

describe('Maya', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const creds = { secretKey: 'sk-secret', publicKey: 'pk-public', mode: 'test' as const };

  it('treats a notice as a trigger only, and reads the payment back with the secret key', async () => {
    expect(mayaAdapter.verifyEvent(creds, JSON.stringify({ id: 'abc-123-def', status: 'PAYMENT_SUCCESS' }), new Headers())).toEqual({ kind: 'paid', checkoutId: 'abc-123-def' });
    fetchMock.mockResolvedValueOnce(reply(200, { id: 'abc-123-def', status: 'PAYMENT_SUCCESS', isPaid: true, amount: '500', fundSource: { type: 'paymaya' } }));
    const state = await mayaAdapter.retrieveCheckout(creds, 'abc-123-def');
    expect(state).toEqual({ id: 'abc-123-def', paid: 500, paymentId: 'abc-123-def', method: 'paymaya', metadata: null });
    expect(fetchMock.mock.calls[0][0]).toBe('https://pg-sandbox.paymaya.com/payments/v1/payments/abc-123-def');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('sk-secret:').toString('base64')}`);
  });

  it('creates the checkout with the public key, on the account’s environment', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { checkoutId: 'c-1', redirectUrl: 'https://maya/c-1' }));
    await mayaAdapter.createCheckout({ ...creds, mode: 'live' }, { amount: 300, name: 'n', description: 'd', reference: 'INV-1', successUrl: 'https://a', cancelUrl: 'https://b', metadata: {} });
    expect(fetchMock.mock.calls[0][0]).toBe('https://pg.paymaya.com/checkout/v1/checkouts');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('pk-public:').toString('base64')}`);
  });
});
