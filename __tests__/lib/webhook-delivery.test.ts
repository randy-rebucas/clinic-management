import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/api-keys', () => ({ tenantHasApiAccess: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/encryption', () => ({ encryptData: (s: string) => `enc:${s}`, decryptData: (s: string) => s.replace(/^enc:/, '') }));
vi.mock('@/models/WebhookDelivery', () => ({ default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/WebhookEndpoint', () => ({ default: { findById: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn() } }));

let nextStatus = 200;
const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
vi.mock('https', () => ({
  default: {
    request: vi.fn((url: string, opts: { headers: Record<string, string> }, onResponse: (res: EventEmitter & { statusCode: number }) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: (b: string) => void; destroy: () => void };
      req.destroy = () => {};
      req.end = (body: string) => {
        sent.push({ url, headers: opts.headers, body });
        const res = Object.assign(new EventEmitter(), { statusCode: nextStatus });
        onResponse(res);
        res.emit('end');
        req.emit('close');
      };
      return req;
    }),
  },
}));

import WebhookDelivery from '@/models/WebhookDelivery';
import WebhookEndpoint from '@/models/WebhookEndpoint';
import { attemptDelivery, MAX_ATTEMPTS, RETRY_BACKOFF_MIN, DISABLE_AFTER_FAILURES, signPayload } from '@/lib/webhooks';

const lean = (v: unknown) => ({ lean: vi.fn().mockResolvedValue(v) });
const select = (v: unknown) => ({ select: vi.fn().mockReturnValue(lean(v)) });

function delivery(attempts = 0) {
  vi.mocked(WebhookDelivery.findOneAndUpdate).mockReturnValue(
    lean({ _id: 'd1', endpointId: 'e1', event: 'appointment.created', body: '{"id":"evt_1"}', attempts, status: 'pending' }) as any
  );
}
function endpoint(consecutiveFailures = 0) {
  vi.mocked(WebhookEndpoint.findById).mockReturnValue(select({ _id: 'e1', url: 'https://hooks.example.com/x', enabled: true, secretEnc: 'enc:whsec_abc', consecutiveFailures }) as any);
  vi.mocked(WebhookEndpoint.findOneAndUpdate).mockReturnValue(lean({ consecutiveFailures: consecutiveFailures + 1 }) as any);
}
const lastSet = () => ((vi.mocked(WebhookDelivery.updateOne).mock.calls.at(-1) as unknown[])[1] as { $set: Record<string, any> }).$set;

describe('attemptDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sent.length = 0;
    nextStatus = 200;
  });

  it('skips a delivery another sender has claimed', async () => {
    vi.mocked(WebhookDelivery.findOneAndUpdate).mockReturnValue(lean(null) as any);
    expect(await attemptDelivery('d1')).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('signs the exact body and marks a 2xx as delivered', async () => {
    delivery();
    endpoint();
    expect(await attemptDelivery('d1')).toBe('succeeded');
    const { headers, body } = sent[0];
    expect(body).toBe('{"id":"evt_1"}');
    const t = Number(headers['MCS-Signature'].match(/t=(\d+)/)![1]);
    expect(headers['MCS-Signature']).toBe(signPayload('whsec_abc', body, t));
    expect(headers['MCS-Event']).toBe('appointment.created');
    expect(lastSet()).toMatchObject({ status: 'succeeded', attempts: 1, nextAttemptAt: null });
  });

  it('schedules a retry on the backoff after a failure', async () => {
    delivery(1);
    endpoint();
    nextStatus = 500;
    const before = Date.now();
    expect(await attemptDelivery('d1')).toBe('pending');
    const set = lastSet();
    expect(set).toMatchObject({ status: 'pending', attempts: 2, responseStatus: 500, error: 'HTTP 500' });
    const wait = (set.nextAttemptAt as Date).getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(RETRY_BACKOFF_MIN[1] * 60_000 - 1000);
    expect(wait).toBeLessThan(RETRY_BACKOFF_MIN[1] * 60_000 + 5000);
  });

  it('gives up after the last attempt', async () => {
    delivery(MAX_ATTEMPTS - 1);
    endpoint();
    nextStatus = 410;
    expect(await attemptDelivery('d1')).toBe('failed');
    expect(lastSet()).toMatchObject({ status: 'failed', nextAttemptAt: null });
  });

  it('switches the endpoint off after too many failures in a row', async () => {
    delivery();
    endpoint(DISABLE_AFTER_FAILURES - 1);
    nextStatus = 503;
    await attemptDelivery('d1');
    expect(WebhookEndpoint.updateOne).toHaveBeenCalledWith({ _id: 'e1' }, { $set: expect.objectContaining({ enabled: false }) });
  });
});
