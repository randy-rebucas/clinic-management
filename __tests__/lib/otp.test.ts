import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/** In-memory stand-in with the same matching rules the code relies on. */
const store = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock('@/models/OtpChallenge', () => {
  const matches = (row: any, filter: any) =>
    Object.entries(filter).every(([key, want]: [string, any]) => {
      const have = row[key];
      if (want && typeof want === 'object' && '$gt' in want) return have > want.$gt;
      if (want && typeof want === 'object' && '$lt' in want) return have < want.$lt;
      return String(have) === String(want);
    });
  const chain = (value: any) => ({ select: () => Promise.resolve(value), then: (ok: any, no: any) => Promise.resolve(value).then(ok, no) });
  return {
    default: {
      updateOne: vi.fn(async (filter: any, update: any) => {
        let row = store.rows.find((r) => matches(r, filter));
        if (!row) {
          row = { _id: `c${store.rows.length}`, ...filter };
          store.rows.push(row);
        }
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
      }),
      findOneAndUpdate: vi.fn((filter: any, update: any) => {
        const row = store.rows.find((r) => matches(r, filter));
        if (row) row.attempts += update.$inc.attempts;
        return chain(row ? { ...row } : null);
      }),
      findOneAndDelete: vi.fn((filter: any) => {
        const index = store.rows.findIndex((r) => matches(r, filter));
        return chain(index < 0 ? null : store.rows.splice(index, 1)[0]);
      }),
    },
  };
});

const twilio = vi.hoisted(() => ({ start: vi.fn(), check: vi.fn() }));
const sms = vi.hoisted(() => ({ send: vi.fn(), configured: vi.fn() }));
vi.mock('@/lib/sms', () => ({
  getTwilioClient: () => ({
    verify: { v2: { services: () => ({ verifications: { create: twilio.start }, verificationChecks: { create: twilio.check } }) } },
  }),
  isSMSConfigured: sms.configured,
  sendSMS: sms.send,
  smsSent: (r: any) => !!r && r.success && !r.skipped,
}));

import { consumeOtp, MAX_OTP_ATTEMPTS, otpAvailable, startOtp } from '@/lib/otp';

const PHONE = '+639171234567';
const message = (code: string) => `code ${code}`;
const sentCode = () => /code (\d{6})/.exec(sms.send.mock.calls.at(-1)![0].message)![1];

describe('lib/otp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.rows.length = 0;
    delete process.env.OTP_PROVIDER;
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VA123';
    sms.send.mockResolvedValue({ success: true, sid: 'SM1' });
  });
  afterEach(() => {
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    vi.unstubAllEnvs();
  });

  describe('local provider', () => {
    it('stores only a hash, and a right code is spent once', async () => {
      expect(await startOtp({ scope: 'patient', phone: PHONE, patientId: '507f1f77bcf86cd799439011', message })).toBe(true);
      const code = sentCode();
      expect(store.rows[0].codeHash).toBeTruthy();
      expect(store.rows[0].codeHash).not.toContain(code);

      const first = await consumeOtp({ scope: 'patient', phone: PHONE }, code);
      expect(first).toMatchObject({ ok: true, phone: PHONE });
      expect(await consumeOtp({ scope: 'patient', phone: PHONE }, code)).toEqual({ ok: false, reason: 'invalid', noChallenge: true });
    });

    it('a new code replaces the old one and clears the old record binding', async () => {
      await startOtp({ scope: 'patient', phone: PHONE, patientId: '507f1f77bcf86cd799439011', message });
      await startOtp({ scope: 'patient', phone: PHONE, message });
      expect(store.rows).toHaveLength(1);
      expect(store.rows[0].patientId).toBeUndefined();
    });

    it('locks after the maximum attempts, even for the right code', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      const code = sentCode();
      const wrong = code === '000000' ? '000001' : '000000';
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
        expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, wrong)).toEqual({ ok: false, reason: 'invalid' });
      }
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, code)).toEqual({ ok: false, reason: 'locked' });
    });

    it('reports an expired code', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      store.rows[0].expiresAt = new Date(Date.now() - 1000);
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, sentCode())).toEqual({ ok: false, reason: 'expired' });
    });

    it('keeps scopes and public purposes apart', async () => {
      await startOtp({ scope: 'public', phone: PHONE, purpose: 'booking', tenantId: '507f1f77bcf86cd799439055', message });
      const code = sentCode();
      expect(await consumeOtp({ scope: 'patient', phone: PHONE }, code)).toMatchObject({ ok: false, noChallenge: true });
      expect(await consumeOtp({ scope: 'public', phone: PHONE, purpose: 'registration' }, code)).toMatchObject({ ok: false, noChallenge: true });
      expect(await consumeOtp({ scope: 'public', phone: PHONE, purpose: 'booking', tenantId: '507f1f77bcf86cd799439055' }, code)).toMatchObject({ ok: true });
    });

    it('does not count or look up a malformed code', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, '12ab')).toEqual({ ok: false, reason: 'invalid' });
      expect(store.rows[0].attempts).toBe(0);
    });

    it('reports a failed send, and treats a skipped send as sent only outside production', async () => {
      sms.send.mockResolvedValue({ success: false, error: 'down' });
      expect(await startOtp({ scope: 'emcr', phone: PHONE, message })).toBe(false);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      sms.send.mockResolvedValue({ success: true, skipped: true });
      expect(await startOtp({ scope: 'emcr', phone: PHONE, message })).toBe(true);
      expect(warn).toHaveBeenCalled();

      warn.mockClear();
      vi.stubEnv('NODE_ENV', 'production');
      expect(await startOtp({ scope: 'emcr', phone: PHONE, message })).toBe(false);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('verify provider', () => {
    beforeEach(() => {
      process.env.OTP_PROVIDER = 'verify';
      twilio.start.mockResolvedValue({ status: 'pending' });
    });

    it('sends through Verify and keeps no code of its own', async () => {
      expect(await startOtp({ scope: 'emcr', phone: PHONE, message })).toBe(true);
      expect(twilio.start).toHaveBeenCalledWith({ to: PHONE, channel: 'sms' });
      expect(sms.send).not.toHaveBeenCalled();
      expect(store.rows[0].codeHash).toBeUndefined();
    });

    it('reports a failed start', async () => {
      twilio.start.mockRejectedValue(Object.assign(new Error('blocked'), { status: 429, code: 60203 }));
      expect(await startOtp({ scope: 'emcr', phone: PHONE, message })).toBe(false);
    });

    it('approved spends the challenge; pending is a wrong code and leaves it', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      twilio.check.mockResolvedValueOnce({ status: 'pending' });
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, '123456')).toEqual({ ok: false, reason: 'invalid' });
      expect(store.rows).toHaveLength(1);

      twilio.check.mockResolvedValueOnce({ status: 'approved' });
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, '123456')).toMatchObject({ ok: true });
      expect(store.rows).toHaveLength(0);
    });

    it('treats 404 as expired and 60202 as locked, and drops the challenge', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      twilio.check.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404, code: 20404 }));
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, '123456')).toEqual({ ok: false, reason: 'expired' });
      expect(store.rows).toHaveLength(0);

      await startOtp({ scope: 'emcr', phone: PHONE, message });
      twilio.check.mockRejectedValueOnce(Object.assign(new Error('max'), { status: 429, code: 60202 }));
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, '123456')).toEqual({ ok: false, reason: 'locked' });
    });

    it('lets an outage surface instead of calling the code wrong', async () => {
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      twilio.check.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 503 }));
      await expect(consumeOtp({ scope: 'emcr', phone: PHONE }, '123456')).rejects.toThrow('boom');
    });

    it('a code sent by the local provider still checks locally after the switch', async () => {
      delete process.env.OTP_PROVIDER;
      await startOtp({ scope: 'emcr', phone: PHONE, message });
      process.env.OTP_PROVIDER = 'verify';
      expect(await consumeOtp({ scope: 'emcr', phone: PHONE }, sentCode())).toMatchObject({ ok: true });
      expect(twilio.check).not.toHaveBeenCalled();
    });
  });

  describe('otpAvailable', () => {
    it('needs a Verify service for verify', () => {
      process.env.OTP_PROVIDER = 'verify';
      expect(otpAvailable()).toBe(true);
      delete process.env.TWILIO_VERIFY_SERVICE_SID;
      expect(otpAvailable()).toBe(false);
    });

    it('in production, local needs SMS configured; in development it does not', () => {
      sms.configured.mockReturnValue(false);
      expect(otpAvailable()).toBe(true);
      vi.stubEnv('NODE_ENV', 'production');
      expect(otpAvailable()).toBe(false);
      sms.configured.mockReturnValue(true);
      expect(otpAvailable()).toBe(true);
    });
  });
});
