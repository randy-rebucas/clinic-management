import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn(async () => false) }));
vi.mock('@/lib/platform-config', () => ({ getPlatformFees: vi.fn(async () => ({ medrepActivationFee: 0 })) }));
vi.mock('@/lib/medrep-invite', () => ({ sendDeferredRepInvite: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  rateLimiters: { auth: {}, public: {}, repSignupEmail: {} },
}));
vi.mock('@/lib/turnstile', () => ({ turnstileRejection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/RepSignup', () => ({ default: { updateOne: vi.fn(), findOneAndDelete: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => {
  const Rep = vi.fn(function (this: any, fields: any) {
    Object.assign(this, fields, { _id: 'rep1', save: vi.fn() });
  });
  return { default: Object.assign(Rep, { findOne: vi.fn() }) };
});

import { sendEmail } from '@/lib/email';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { getPlatformFees } from '@/lib/platform-config';
import { sendDeferredRepInvite } from '@/lib/medrep-invite';
import { turnstileRejection } from '@/lib/turnstile';
import { hashInviteToken } from '@/lib/user-invite';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepSignup from '@/models/RepSignup';
import User from '@/models/User';
import { POST } from '@/app/api/medical-representatives/onboard/route';
import { POST as confirm } from '@/app/api/medical-representatives/onboard/confirm/route';

const Rep = MedicalRepresentative as any;
const valid = { firstName: 'Ana', lastName: 'Cruz', email: 'Ana@Example.com', phone: '09171234567', company: 'Acme', turnstileToken: 'tok' };
const TOKEN = 'a'.repeat(43);

const request = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });
const signUp = (body: unknown) => POST(request('/api/medical-representatives/onboard', body));
const confirmWith = (token: unknown) => confirm(request('/api/medical-representatives/onboard/confirm', { token }));

describe('medical rep signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MEDREP_SELF_SIGNUP_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    vi.mocked(turnstileRejection).mockResolvedValue(null);
    Rep.findOne.mockResolvedValue(null);
    vi.mocked(User.findOne).mockResolvedValue(null as any);
    vi.mocked(isPayMongoConfigured).mockResolvedValue(false);
    vi.mocked(getPlatformFees).mockResolvedValue({ medrepActivationFee: 0 } as any);
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('POST /onboard', () => {
    it('creates nothing but a pending signup, and emails a link holding a token it does not store', async () => {
      expect((await signUp(valid)).status).toBe(202);
      expect(Rep).not.toHaveBeenCalled();

      const [filter, update, options] = vi.mocked(RepSignup.updateOne).mock.calls[0] as any[];
      expect(filter).toEqual({ email: 'ana@example.com' });
      expect(options).toEqual({ upsert: true });

      const mail = vi.mocked(sendEmail).mock.calls[0][0];
      expect(mail.to).toBe('ana@example.com');
      const token = /confirm\?token=([\w-]{43})/.exec(mail.html as string)![1];
      expect(mail.html).toContain('https://app.example.com/medical-representatives/onboard/confirm?token=');
      expect(JSON.stringify(update)).not.toContain(token);
      expect(update.$set.tokenHash).toBe(hashInviteToken(token));
    });

    it('looks identical for a new address, a rep and a staff account', async () => {
      const fresh = await (await signUp(valid)).json();

      Rep.findOne.mockResolvedValueOnce({ _id: 'x' });
      const rep = await signUp(valid);
      vi.mocked(User.findOne).mockResolvedValueOnce({ _id: 'y' } as any);
      const staff = await signUp(valid);

      expect(rep.status).toBe(202);
      expect(staff.status).toBe(202);
      expect(await rep.json()).toEqual(fresh);
      expect(await staff.json()).toEqual(fresh);
      // The owner hears about it; no link, and no signup is stored.
      expect(RepSignup.updateOne).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendEmail).mock.calls[1][0].html).not.toContain('token=');
    });

    it('escapes nothing into the email from the form', async () => {
      await signUp({ ...valid, firstName: '<b>x</b>' });
      expect(vi.mocked(sendEmail).mock.calls[0][0].html).not.toContain('<b>x');
    });

    it('refuses a failed captcha before touching the database', async () => {
      vi.mocked(turnstileRejection).mockResolvedValue(new Response(null, { status: 403 }) as any);
      expect((await signUp(valid)).status).toBe(403);
      expect(Rep.findOne).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('does not spend the captcha on a form with missing fields', async () => {
      expect((await signUp({ ...valid, company: '' })).status).toBe(400);
      expect(turnstileRejection).not.toHaveBeenCalled();
    });
  });

  describe('POST /onboard/confirm', () => {
    const pending = { email: 'ana@example.com', fields: { firstName: 'Ana', lastName: 'Cruz', phone: '0917', company: 'Acme', products: [] } };

    it('refuses a malformed, used or expired token', async () => {
      expect((await confirmWith('nope')).status).toBe(400);
      expect(RepSignup.findOneAndDelete).not.toHaveBeenCalled();

      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(null as any);
      expect((await confirmWith(TOKEN)).status).toBe(400);
      expect(Rep).not.toHaveBeenCalled();
    });

    it('finds the signup by hash and spends it', async () => {
      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(pending as any);
      expect((await confirmWith(TOKEN)).status).toBe(201);
      expect((vi.mocked(RepSignup.findOneAndDelete).mock.calls[0][0] as any).tokenHash).toBe(hashInviteToken(TOKEN));
    });

    it('with no online payment, invites straight away', async () => {
      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(pending as any);
      await confirmWith(TOKEN);
      expect(Rep.mock.calls[0][0]).toMatchObject({ email: 'ana@example.com', status: 'inactive', inviteDeferred: false });
    });

    it('with online payment, holds the invite and returns the checkout', async () => {
      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(pending as any);
      vi.mocked(isPayMongoConfigured).mockResolvedValue(true);
      vi.mocked(getPlatformFees).mockResolvedValue({ medrepActivationFee: 500 } as any);
      vi.mocked(createCheckoutSession).mockResolvedValue({ checkoutUrl: 'https://pay.example.com/x' } as any);

      const res = await confirmWith(TOKEN);
      expect((await res.json()).checkoutUrl).toBe('https://pay.example.com/x');
      expect(Rep.mock.calls[0][0].inviteDeferred).toBe(true);
      expect(sendDeferredRepInvite).not.toHaveBeenCalled();
    });

    it('releases the invite when no checkout could be made, so the rep is not stranded', async () => {
      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(pending as any);
      vi.mocked(isPayMongoConfigured).mockResolvedValue(true);
      vi.mocked(getPlatformFees).mockResolvedValue({ medrepActivationFee: 500 } as any);
      vi.mocked(createCheckoutSession).mockRejectedValue(new Error('down'));

      expect((await confirmWith(TOKEN)).status).toBe(201);
      expect(sendDeferredRepInvite).toHaveBeenCalledWith('rep1');
    });

    it('refuses if the address was taken after the link went out', async () => {
      vi.mocked(RepSignup.findOneAndDelete).mockResolvedValue(pending as any);
      Rep.findOne.mockResolvedValueOnce({ _id: 'x' });
      expect((await confirmWith(TOKEN)).status).toBe(409);
      expect(Rep).not.toHaveBeenCalled();
    });
  });
});
