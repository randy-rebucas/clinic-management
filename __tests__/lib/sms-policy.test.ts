import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/subscription', () => ({ checkSubscriptionStatus: vi.fn() }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn().mockResolvedValue('Asia/Manila') }));
vi.mock('@/models/SmsPreference', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/SmsUsage', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/models/SmsMessage', () => ({ default: { create: vi.fn() } }));

const create = vi.hoisted(() => vi.fn());
vi.mock('twilio', () => ({ default: () => ({ messages: { create } }) }));

import { getSettings } from '@/lib/settings';
import { checkSubscriptionStatus } from '@/lib/subscription';
import SmsPreference from '@/models/SmsPreference';
import SmsUsage from '@/models/SmsUsage';
import SmsMessage from '@/models/SmsMessage';
import { decideSms, forgetSmsState, isFinalBlock, smsSegments } from '@/lib/sms-policy';
import { clinicMonth } from '@/lib/tz';

const TENANT = '507f1f77bcf86cd799439055';
const PHONE = '+639171234567';

function preferences(rows: unknown[]) {
  vi.mocked(SmsPreference.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(rows) }) } as any);
}

const decide = (category: 'transactional' | 'promotional' = 'transactional', message = 'Your turn') =>
  decideSms({ tenantId: TENANT, category, phone: PHONE, message, template: 't' });

describe('sms policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetSmsState();
    vi.stubEnv('SMS_POLICY_MODE', 'enforce');
    vi.mocked(checkSubscriptionStatus).mockResolvedValue({ isActive: true, plan: 'basic' } as any);
    vi.mocked(getSettings).mockResolvedValue({ clinicName: 'Sunrise Clinic', communicationSettings: { smsEnabled: true } } as any);
    vi.mocked(SmsUsage.updateOne).mockResolvedValue({} as any);
    preferences([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('allows a routine text and reserves its segments', async () => {
    const decision = await decide();
    expect(decision).toMatchObject({ allowed: true, reservation: { segments: 1 } });
    expect(vi.mocked(SmsUsage.updateOne).mock.calls[0][0]).toMatchObject({ segments: { $lte: 499 } });
  });

  it.each([
    ['an inactive clinic', () => vi.mocked(checkSubscriptionStatus).mockResolvedValue({ isActive: false, plan: 'basic' } as any), 'inactive'],
    ['texts switched off', () => vi.mocked(getSettings).mockResolvedValue({ communicationSettings: { smsEnabled: false } } as any), 'disabled'],
    ['an opted-out number', () => preferences([{ phoneE164: PHONE, optedOut: true }]), 'opted-out'],
  ])('blocks %s without spending quota', async (_name, arrange, reason) => {
    arrange();
    expect(await decide()).toEqual({ allowed: false, reason });
    expect(SmsUsage.updateOne).not.toHaveBeenCalled();
  });

  it('needs consent for promotional texts only', async () => {
    expect(await decide('promotional')).toEqual({ allowed: false, reason: 'no-consent' });
    expect(await decide('transactional')).toMatchObject({ allowed: true });

    forgetSmsState();
    preferences([{ phoneE164: PHONE, promoOptIn: true }]);
    expect(await decide('promotional')).toMatchObject({ allowed: true });
  });

  it('stops promotional texts at 80% of the quota', async () => {
    preferences([{ phoneE164: PHONE, promoOptIn: true }]);
    await decide('promotional');
    expect(vi.mocked(SmsUsage.updateOne).mock.calls[0][0]).toMatchObject({ segments: { $lte: 399 } });
  });

  it('reads a collision on the unique index as a full quota', async () => {
    vi.mocked(SmsUsage.updateOne).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await decide()).toEqual({ allowed: false, reason: 'quota' });
  });

  it('report mode sends anyway, still counting usage', async () => {
    vi.stubEnv('SMS_POLICY_MODE', '');
    vi.mocked(getSettings).mockResolvedValue({ communicationSettings: { smsEnabled: false } } as any);
    vi.mocked(SmsUsage.updateOne).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await decide()).toMatchObject({ allowed: true });
    expect((vi.mocked(SmsUsage.updateOne).mock.calls[1] as any[])[1]).toEqual({ $inc: { segments: 1 } });
  });

  it('reads clinic state once per clinic, not once per text', async () => {
    await decide();
    await decide();
    await decide();
    expect(checkSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(SmsPreference.find).toHaveBeenCalledTimes(1);
  });

  it('adds a stop link to promotional texts only', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    preferences([{ phoneE164: PHONE, promoOptIn: true }]);
    const promo = await decide('promotional', 'Sunrise Clinic: happy birthday');
    expect(promo).toMatchObject({ allowed: true, message: expect.stringContaining('https://app.example.com/sms/opt-out/') });
    expect((await decide()) as any).not.toMatchObject({ message: expect.stringContaining('/sms/opt-out/') });
  });

  it('names the clinic when the text does not', async () => {
    expect(await decide()).toMatchObject({ message: 'Sunrise Clinic: Your turn' });
    expect(await decide('transactional', 'SUNRISE CLINIC: your turn')).toMatchObject({ message: 'SUNRISE CLINIC: your turn' });
  });

  it('treats quota and inactive as retryable, the rest as final', () => {
    expect(isFinalBlock('quota')).toBe(false);
    expect(isFinalBlock('inactive')).toBe(false);
    expect(isFinalBlock('opted-out')).toBe(true);
    expect(isFinalBlock('disabled')).toBe(true);
    expect(isFinalBlock(undefined)).toBe(false);
  });
});

describe('smsSegments', () => {
  it('counts GSM-7 at 160, then 153 per part', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
  });

  it('counts a peso sign or em dash as UCS-2: 70, then 67 per part', () => {
    expect(smsSegments('₱' + 'a'.repeat(69))).toBe(1);
    expect(smsSegments('₱' + 'a'.repeat(70))).toBe(2);
    expect(smsSegments('— ' + 'a'.repeat(100))).toBe(2);
  });

  it('counts GSM extension characters twice', () => {
    expect(smsSegments('[' + 'a'.repeat(159))).toBe(2);
  });
});

describe('clinicMonth', () => {
  it('uses the clinic-local month', () => {
    expect(clinicMonth('Asia/Manila', new Date('2026-10-31T17:00:00Z'))).toBe('2026-11');
    expect(clinicMonth('UTC', new Date('2026-10-31T17:00:00Z'))).toBe('2026-10');
  });
});

describe('sendSMS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetSmsState();
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
    vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', 'MG1');
    vi.stubEnv('SMS_POLICY_MODE', 'enforce');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    vi.mocked(checkSubscriptionStatus).mockResolvedValue({ isActive: true, plan: 'basic' } as any);
    vi.mocked(getSettings).mockResolvedValue({ clinicName: 'Sunrise', communicationSettings: { smsEnabled: true } } as any);
    vi.mocked(SmsUsage.updateOne).mockResolvedValue({} as any);
    preferences([]);
    create.mockResolvedValue({ sid: 'SM1' });
  });
  afterEach(() => vi.unstubAllEnvs());

  const send = async (overrides = {}) => {
    const { sendSMS } = await import('@/lib/sms');
    return sendSMS({ to: '09171234567', message: 'Hello', tenantId: TENANT, category: 'transactional', template: 't', ...overrides });
  };

  it('sends through the Messaging Service with a callback, and logs without the body', async () => {
    expect(await send()).toMatchObject({ success: true, sid: 'SM1' });
    const sent = create.mock.calls[0][0];
    expect(sent).toMatchObject({ messagingServiceSid: 'MG1', to: PHONE, body: 'Sunrise: Hello' });
    expect(sent.from).toBeUndefined();
    expect(sent.statusCallback).toMatch(/^https:\/\/app\.example\.com\/api\/webhooks\/twilio\/status\?id=[0-9a-f]{24}$/);

    const log = vi.mocked(SmsMessage.create).mock.calls[0][0] as any;
    expect(log).toMatchObject({ status: 'sent', sid: 'SM1', template: 't', phoneMasked: '+63******4567' });
    expect(JSON.stringify(log)).not.toContain('Hello');
    expect(String(log._id)).toBe(sent.statusCallback.split('id=')[1]);
  });

  it('never sends a blocked text', async () => {
    vi.mocked(getSettings).mockResolvedValue({ communicationSettings: { smsEnabled: false } } as any);
    expect(await send()).toMatchObject({ success: false, blocked: 'disabled' });
    expect(create).not.toHaveBeenCalled();
  });

  it('sign-in codes skip the policy and the quota', async () => {
    vi.mocked(getSettings).mockResolvedValue({ communicationSettings: { smsEnabled: false } } as any);
    expect(await send({ tenantId: null, category: 'auth' })).toMatchObject({ success: true });
    expect(SmsUsage.updateOne).not.toHaveBeenCalled();
  });

  it('refunds the quota and logs when Twilio refuses', async () => {
    create.mockRejectedValue(Object.assign(new Error('nope'), { code: 21211 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await send()).toMatchObject({ success: false, error: 'nope' });
    expect((vi.mocked(SmsUsage.updateOne).mock.calls[1] as any[])[1]).toEqual({ $inc: { segments: -1 } });
    expect(vi.mocked(SmsMessage.create).mock.calls[0][0]).toMatchObject({ status: 'failed', errorCode: '21211' });
  });

  it('a failed log write does not fail a sent text', async () => {
    vi.mocked(SmsMessage.create).mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await send()).toMatchObject({ success: true, sid: 'SM1' });
  });
});
