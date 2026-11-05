import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getExpectedTwilioSignature } from 'twilio/lib/webhooks/webhooks';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/SmsMessage', () => ({ default: { updateOne: vi.fn() } }));

import SmsMessage from '@/models/SmsMessage';
import { POST } from '@/app/api/webhooks/twilio/status/route';

const ID = '507f1f77bcf86cd799439011';
const URL_SIGNED = `https://app.example.com/api/webhooks/twilio/status?id=${ID}`;

function call(params: Record<string, string>, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  const value = signature ?? getExpectedTwilioSignature('token', URL_SIGNED, params);
  if (value) headers['x-twilio-signature'] = value;
  return POST(new NextRequest(`http://internal/api/webhooks/twilio/status?id=${ID}`, { method: 'POST', headers, body: new URLSearchParams(params).toString() }));
}

describe('POST /api/webhooks/twilio/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a bad signature', async () => {
    expect((await call({ MessageStatus: 'failed' }, 'forged')).status).toBe(403);
    expect(SmsMessage.updateOne).not.toHaveBeenCalled();
  });

  it('records a failure with its error code', async () => {
    expect((await call({ MessageStatus: 'undelivered', ErrorCode: '30008' })).status).toBe(204);
    expect(SmsMessage.updateOne).toHaveBeenCalledWith({ _id: ID }, { $set: { status: 'undelivered', errorCode: '30008' } });
  });

  it('writes nothing for ordinary progress', async () => {
    for (const MessageStatus of ['queued', 'sent', 'delivered']) {
      expect((await call({ MessageStatus })).status).toBe(204);
    }
    expect(SmsMessage.updateOne).not.toHaveBeenCalled();
  });
});
