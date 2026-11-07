import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

import { isEmailConfigured, sendEmail } from '@/lib/email';

const sent = (id = 'email-1') => ({ data: { id }, error: null, headers: null });
const failed = (name: string, message: string, headers: Record<string, string> | null = null) => ({
  data: null,
  error: { name, message, statusCode: 429 },
  headers,
});

describe('sendEmail', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'MyClinicSoft <noreply@example.com>');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    send.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['RESEND_API_KEY', 'EMAIL_FROM'])('skips without calling Resend when %s is missing', async (name) => {
    vi.stubEnv(name, '');
    expect(isEmailConfigured()).toBe(false);
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(result).toMatchObject({ success: false, skipped: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends from EMAIL_FROM with a text version and returns the message id', async () => {
    send.mockResolvedValue(sent());
    const result = await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 'Hi', html: '<p>Hello</p>', cc: 'c@example.com' });
    expect(result).toEqual({ success: true, messageId: 'email-1' });
    expect(send.mock.calls[0][0]).toMatchObject({
      from: 'MyClinicSoft <noreply@example.com>',
      to: ['a@example.com', 'b@example.com'],
      cc: 'c@example.com',
      subject: 'Hi',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('keeps binary attachments and turns text ones into bytes, since Resend reads strings as base64', async () => {
    send.mockResolvedValue(sent());
    const pdf = Buffer.from([1, 2, 3]);
    await sendEmail({
      to: 'a@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      attachments: [
        { filename: 'a.pdf', content: pdf, contentType: 'application/pdf' },
        { filename: 'b.txt', content: 'plain text' },
      ],
    });
    const { attachments } = send.mock.calls[0][0];
    expect(attachments[0]).toEqual({ filename: 'a.pdf', content: pdf, contentType: 'application/pdf' });
    expect(attachments[1].content.toString()).toBe('plain text');
  });

  it('reports a failure Resend returns rather than throws', async () => {
    send.mockResolvedValue(failed('invalid_from_address', 'Domain not verified'));
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(result).toEqual({ success: false, error: 'Domain not verified' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports a failure when the request itself throws', async () => {
    send.mockRejectedValue(new Error('network down'));
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(result).toEqual({ success: false, error: 'network down' });
  });

  it('waits out the rate limit and sends', async () => {
    vi.useFakeTimers();
    send.mockResolvedValueOnce(failed('rate_limit_exceeded', 'Too many requests', { 'retry-after': '1' })).mockResolvedValueOnce(sent());
    const pending = sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ success: true, messageId: 'email-1' });
  });

  it('gives up after the retries are spent', async () => {
    vi.useFakeTimers();
    send.mockResolvedValue(failed('rate_limit_exceeded', 'Too many requests'));
    const pending = sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ success: false, error: 'Too many requests' });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('does not retry a spent quota, which waiting will not clear', async () => {
    send.mockResolvedValue(failed('daily_quota_exceeded', 'Daily quota reached'));
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(result).toEqual({ success: false, error: 'Daily quota reached' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
