import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return { ...actual, sendEmail: (...a: unknown[]) => sendEmail(...a), isEmailConfigured: () => isEmailConfigured() };
});

import {
  INVITE_TTL_MS,
  buildSetPasswordUrl,
  generateInviteToken,
  hashInviteToken,
  isInviteTokenFormat,
  maskEmail,
  randomUnusablePasswordHash,
  sendSetPasswordEmail,
  validatePasswordPolicy,
  verifyInviteToken,
} from '@/lib/user-invite';

describe('invite tokens', () => {
  it('generates a 32-byte url-safe token, stores only its sha256, expires in 72h', () => {
    const now = Date.UTC(2026, 9, 16);
    const invite = generateInviteToken(now);
    expect(isInviteTokenFormat(invite.token)).toBe(true);
    expect(Buffer.from(invite.token, 'base64url')).toHaveLength(32);
    expect(invite.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.tokenHash).toBe(hashInviteToken(invite.token));
    expect(invite.tokenHash).not.toContain(invite.token);
    expect(invite.expiresAt.getTime()).toBe(now + INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('never repeats tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInviteToken().token));
    expect(tokens.size).toBe(50);
  });

  it('verifies the right token before expiry only', () => {
    const now = Date.now();
    const invite = generateInviteToken(now);
    const stored = { inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt };
    expect(verifyInviteToken(invite.token, stored, now)).toBe(true);
    expect(verifyInviteToken(invite.token, stored, invite.expiresAt.getTime())).toBe(false);
    expect(verifyInviteToken(generateInviteToken().token, stored, now)).toBe(false);
  });

  it('rejects malformed input, missing hashes and non-strings', () => {
    const invite = generateInviteToken();
    const stored = { inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt };
    expect(verifyInviteToken({ $ne: null }, stored)).toBe(false);
    expect(verifyInviteToken(invite.token + 'x', stored)).toBe(false);
    expect(verifyInviteToken(invite.token, { inviteTokenHash: null, inviteExpiresAt: invite.expiresAt })).toBe(false);
    expect(verifyInviteToken(invite.token, { inviteTokenHash: invite.tokenHash, inviteExpiresAt: null })).toBe(false);
    expect(verifyInviteToken(invite.token, { inviteTokenHash: 'abcd', inviteExpiresAt: invite.expiresAt })).toBe(false);
    expect(verifyInviteToken(invite.token, null)).toBe(false);
  });

  it('random password hash does not match the old defaults', async () => {
    const hash = await randomUnusablePasswordHash();
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare('Password1234!', hash)).toBe(false);
  }, 20_000);
});

describe('validatePasswordPolicy', () => {
  it('accepts a long passphrase', () => {
    expect(validatePasswordPolicy('correct horse battery staple')).toEqual([]);
  });

  it('requires at least 12 characters', () => {
    expect(validatePasswordPolicy('Sh0rt!pass')).toContain('Password must be at least 12 characters.');
    expect(validatePasswordPolicy('')).toEqual(['Password is required.']);
    expect(validatePasswordPolicy(undefined)).toEqual(['Password is required.']);
  });

  it('rejects the old default and common passwords', () => {
    expect(validatePasswordPolicy('Password1234!').join(' ')).toMatch(/too common/);
  });

  it('rejects passwords longer than bcrypt can hash', () => {
    expect(validatePasswordPolicy('a1b2c3d4'.repeat(10)).join(' ')).toMatch(/at most 72 bytes/);
  });

  it('rejects repeated characters and passwords containing the email name', () => {
    expect(validatePasswordPolicy('aaaaaaaaaaaaaaaa').join(' ')).toMatch(/distinct/);
    expect(validatePasswordPolicy('maria.santos-2026!', { email: 'maria.santos@clinic.ph' }).join(' ')).toMatch(/email/);
  });
});

describe('links and masking', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('builds the link on the clinic subdomain when ROOT_DOMAIN is set', () => {
    process.env.APP_BASE_URL = 'https://app.example.com';
    process.env.ROOT_DOMAIN = 'example.com';
    expect(buildSetPasswordUrl('tok_en', 'acme')).toBe('https://acme.example.com/set-password?token=tok_en');
    expect(buildSetPasswordUrl('tok_en', null)).toBe('https://app.example.com/set-password?token=tok_en');
    expect(buildSetPasswordUrl('tok_en', 'evil.com/x')).toBe('https://app.example.com/set-password?token=tok_en');
  });

  it('falls back to NEXT_PUBLIC_APP_URL', () => {
    delete process.env.APP_BASE_URL;
    delete process.env.ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_APP_URL = 'https://clinic.example.org';
    expect(buildSetPasswordUrl('t', 'acme')).toBe('https://clinic.example.org/set-password?token=t');
  });

  it('masks emails', () => {
    expect(maskEmail('juan@clinic.ph')).toBe('j***@clinic.ph');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail(undefined)).toBe('***');
  });
});

describe('sendSetPasswordEmail', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sendEmail.mockReset();
    isEmailConfigured.mockReset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.APP_BASE_URL = 'https://app.example.com';
  });
  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('does not send and logs only a masked email (no token) when SMTP is not configured', async () => {
    isEmailConfigured.mockReturnValue(false);
    const { token } = generateInviteToken();
    const result = await sendSetPasswordEmail({ email: 'juan@clinic.ph', name: 'Juan', token });
    expect(result).toBe('not-configured');
    expect(sendEmail).not.toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('j***@clinic.ph');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('juan@');
  });

  it('sends an escaped email containing the link', async () => {
    isEmailConfigured.mockReturnValue(true);
    sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
    const { token } = generateInviteToken();
    const result = await sendSetPasswordEmail({ email: 'juan@clinic.ph', name: '<script>x</script>', token });
    expect(result).toBe('sent');
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toBe('juan@clinic.ph');
    expect(sent.html).toContain(`/set-password?token=${token}`);
    expect(sent.html).not.toContain('<script>x</script>');
    expect(sent.html).toContain('&lt;script&gt;');
  });

  it('reports failure without throwing or logging the token', async () => {
    isEmailConfigured.mockReturnValue(true);
    sendEmail.mockResolvedValue({ success: false, error: 'boom' });
    const { token } = generateInviteToken();
    expect(await sendSetPasswordEmail({ email: 'juan@clinic.ph', name: 'Juan', token })).toBe('failed');
    expect(error.mock.calls.flat().join(' ')).not.toContain(token);
  });
});
