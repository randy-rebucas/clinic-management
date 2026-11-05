import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/MobileDevice', () => ({ default: {} }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  rateLimiters: { otpSend: {}, otpRequest: {}, publicCodeIp: {}, publicCodeClinic: {}, publicCodeGlobal: {} },
}));
vi.mock('@/lib/turnstile', () => ({ turnstileRejection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/redis', () => ({ redisRestEnv: vi.fn(() => ({ url: 'https://redis' })) }));
vi.mock('@/lib/otp', () => ({
  OTP_EXPIRY_MINUTES: 10,
  otpAvailable: vi.fn(() => true),
  startOtp: vi.fn(async () => true),
  consumeOtp: vi.fn(),
}));
vi.mock('@/lib/public-tenant', () => ({ resolvePublicTenant: vi.fn() }));

import { turnstileRejection } from '@/lib/turnstile';
import { redisRestEnv } from '@/lib/redis';
import { consumeOtp, otpAvailable, startOtp } from '@/lib/otp';
import { resolvePublicTenant } from '@/lib/public-tenant';
import { createPhoneProof, phoneProofMatches } from '@/lib/public-phone-proof';
import { POST as start } from '@/app/api/public/phone-verification/start/route';
import { POST as check } from '@/app/api/public/phone-verification/check/route';

const TENANT = new Types.ObjectId('507f1f77bcf86cd799439055');
const OTHER_CLINIC = new Types.ObjectId('507f1f77bcf86cd799439066');
const PHONE = '+639171234567';

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const startBody = { phone: '09171234567', purpose: 'booking', turnstileToken: 'tok' };

describe('public phone verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePublicTenant).mockResolvedValue(TENANT);
    vi.mocked(otpAvailable).mockReturnValue(true);
    vi.mocked(startOtp).mockResolvedValue(true);
    vi.mocked(turnstileRejection).mockResolvedValue(null);
    vi.mocked(redisRestEnv).mockReturnValue({ url: 'https://redis' });
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('start', () => {
    it('sends a code bound to the clinic and form', async () => {
      const res = await start(post('/api/public/phone-verification/start', startBody));
      expect(res.status).toBe(200);
      expect(startOtp).toHaveBeenCalledWith(expect.objectContaining({ scope: 'public', phone: PHONE, purpose: 'booking', tenantId: TENANT }));
    });

    it('refuses a failed captcha before sending anything', async () => {
      vi.mocked(turnstileRejection).mockResolvedValue(new Response(null, { status: 400 }) as any);
      expect((await start(post('/api/public/phone-verification/start', startBody))).status).toBe(400);
      expect(startOtp).not.toHaveBeenCalled();
    });

    it('in production, stays closed without the captcha secret or shared rate limits', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('TURNSTILE_SECRET_KEY', '');
      expect((await start(post('/api/public/phone-verification/start', startBody))).status).toBe(503);

      vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
      vi.mocked(redisRestEnv).mockReturnValue({});
      expect((await start(post('/api/public/phone-verification/start', startBody))).status).toBe(503);
      expect(startOtp).not.toHaveBeenCalled();
    });

    it('says so when the text could not be sent', async () => {
      vi.mocked(startOtp).mockResolvedValue(false);
      expect((await start(post('/api/public/phone-verification/start', startBody))).status).toBe(502);
    });

    it('refuses an unknown clinic and an unusable number', async () => {
      vi.mocked(resolvePublicTenant).mockResolvedValueOnce(null);
      expect((await start(post('/api/public/phone-verification/start', startBody))).status).toBe(404);
      expect((await start(post('/api/public/phone-verification/start', { ...startBody, phone: 'abc' }))).status).toBe(400);
    });
  });

  describe('check', () => {
    it('turns a right code into a proof for that number, clinic and form only', async () => {
      vi.mocked(consumeOtp).mockResolvedValue({ ok: true, phone: PHONE });
      const res = await check(post('/api/public/phone-verification/check', { phone: '09171234567', code: '123456', purpose: 'booking' }));
      const { proof } = await res.json();

      expect(consumeOtp).toHaveBeenCalledWith({ scope: 'public', phone: PHONE, purpose: 'booking', tenantId: TENANT }, '123456');
      expect(phoneProofMatches(proof, PHONE, TENANT, 'booking')).toBe(true);
      expect(phoneProofMatches(proof, '+639170000000', TENANT, 'booking')).toBe(false);
      expect(phoneProofMatches(proof, PHONE, OTHER_CLINIC, 'booking')).toBe(false);
      expect(phoneProofMatches(proof, PHONE, TENANT, 'registration')).toBe(false);
    });

    it('gives no proof for a wrong code', async () => {
      vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'invalid' });
      const res = await check(post('/api/public/phone-verification/check', { phone: PHONE, code: '000000', purpose: 'booking' }));
      expect(res.status).toBe(401);
      expect((await res.json()).proof).toBeUndefined();
    });
  });

  describe('proof', () => {
    it('refuses a tampered, expired or missing proof', () => {
      const { token } = createPhoneProof(PHONE, TENANT, 'booking');
      expect(phoneProofMatches(`${token}x`, PHONE, TENANT, 'booking')).toBe(false);
      expect(phoneProofMatches(undefined, PHONE, TENANT, 'booking')).toBe(false);

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      expect(phoneProofMatches(token, PHONE, TENANT, 'booking')).toBe(false);
      vi.useRealTimers();
    });
  });
});
