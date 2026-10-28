import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('server-only', () => ({}));

import { verifyWebhookSignature } from '@/lib/lab-integration';

const SECRET = 'lab-secret';
const BODY = '{"requestId":"R1","results":{"k":"3.2"}}';
const sign = (data: string) => `sha256=${createHmac('sha256', SECRET).update(data).digest('hex')}`;
const now = 1_800_000_000_000;
const ts = String(now / 1000);

describe('lab webhook signature', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a fresh timestamped signature', () => {
    expect(verifyWebhookSignature(BODY, { signature: sign(`${ts}.${BODY}`), timestamp: ts }, SECRET, now)).toBe(true);
  });

  it('refuses a replay outside the 5-minute window', () => {
    const later = now + 6 * 60 * 1000;
    expect(verifyWebhookSignature(BODY, { signature: sign(`${ts}.${BODY}`), timestamp: ts }, SECRET, later)).toBe(false);
  });

  it('refuses a timestamp the signature does not cover', () => {
    const other = String(now / 1000 + 1);
    expect(verifyWebhookSignature(BODY, { signature: sign(`${ts}.${BODY}`), timestamp: other }, SECRET, now)).toBe(false);
  });

  it('refuses the old body-only signature unless legacy mode is on', () => {
    expect(verifyWebhookSignature(BODY, { signature: sign(BODY), timestamp: null }, SECRET, now)).toBe(false);
    vi.stubEnv('LAB_WEBHOOK_LEGACY_SIGNATURES', 'true');
    expect(verifyWebhookSignature(BODY, { signature: sign(BODY), timestamp: null }, SECRET, now)).toBe(true);
  });

  it('refuses another secret', () => {
    const forged = `sha256=${createHmac('sha256', 'other').update(`${ts}.${BODY}`).digest('hex')}`;
    expect(verifyWebhookSignature(BODY, { signature: forged, timestamp: ts }, SECRET, now)).toBe(false);
  });
});
