/**
 * Staff account invites and admin-triggered password resets.
 *
 * New accounts get an unusable random password plus a single-use set-password token.
 * Only the sha256 of the token is stored (User.inviteTokenHash, select:false); the raw
 * token exists only in the emailed link and must never be logged.
 *
 * Relative imports only: this module is also loaded by tsx scripts and model hooks.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateSetPasswordEmail, isEmailConfigured, sendEmail } from './email';

export const INVITE_TTL_HOURS = 72;
export const INVITE_TTL_MS = INVITE_TTL_HOURS * 60 * 60 * 1000;

export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt ignores everything after 72 bytes; refuse rather than silently truncate. */
export const PASSWORD_MAX_BYTES = 72;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface InviteToken {
  /** Raw token for the emailed link. Never store or log it. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateInviteToken(now: number = Date.now()): InviteToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(now + INVITE_TTL_MS) };
}

/** Cheap shape check so malformed input never reaches the database. */
export function isInviteTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** Constant-time check of a raw token against a stored hash and expiry. */
export function verifyInviteToken(
  token: unknown,
  stored: { inviteTokenHash?: string | null; inviteExpiresAt?: Date | string | null } | null | undefined,
  now: number = Date.now()
): boolean {
  if (!isInviteTokenFormat(token) || !stored?.inviteTokenHash || !stored.inviteExpiresAt) return false;
  const expected = Buffer.from(stored.inviteTokenHash, 'hex');
  const actual = Buffer.from(hashInviteToken(token), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  const expiresAt = new Date(stored.inviteExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/** bcrypt hash of 32 random bytes: nobody, including us, knows the password. */
export async function randomUnusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('base64url'), 12);
}

/** Fields to $set on a User to (re)issue an invite. The previous token stops working. */
export function inviteUpdate(invite: InviteToken): { inviteTokenHash: string; inviteExpiresAt: Date } {
  return { inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt };
}

// ── Password policy ───────────────────────────────────────────────────────────

const COMMON_PASSWORDS = new Set(
  [
    'password1234!', 'password1234', 'password123!', 'password12345', 'passwordpassword',
    '123456789012', '1234567890123', 'qwertyuiop12', 'qwerty123456', 'iloveyou1234',
    'administrator', 'admin1234567', 'welcome12345', 'letmein12345', 'changeme1234',
  ]
);

/**
 * Password policy for staff accounts. Length over composition (NIST 800-63B):
 * 12+ characters, at most 72 bytes, not a known default/common password, not built
 * from the user's email, and not a single repeated character.
 * Returns a list of human-readable problems (empty = acceptable).
 */
export function validatePasswordPolicy(password: unknown, context: { email?: string | null; name?: string | null } = {}): string[] {
  if (typeof password !== 'string' || password.length === 0) return ['Password is required.'];
  const errors: string[] = [];
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    errors.push(`Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    errors.push('This password is too common. Choose something less predictable.');
  }
  if (new Set(password).size < 4) {
    errors.push('Password must use more than a few distinct characters.');
  }
  const localPart = context.email?.split('@')[0]?.toLowerCase().trim();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    errors.push('Password must not contain your email address.');
  }
  return errors;
}

// ── Links and email ───────────────────────────────────────────────────────────

/** "j***@example.com" — safe for logs and script output. */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

function rootDomain(): string | null {
  const value = process.env.ROOT_DOMAIN?.split(':')[0].trim().toLowerCase().replace(/^\./, '');
  return value || null;
}

/**
 * Absolute set-password link. Login resolves the clinic from the subdomain, so tenant
 * users get their clinic's host; tenant-less users (medical reps) get the base host.
 */
export function buildSetPasswordUrl(token: string, subdomain?: string | null): string {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = new URL('/set-password', base);
  const root = rootDomain();
  if (subdomain && root && /^[a-z0-9-]+$/i.test(subdomain)) {
    url.hostname = `${subdomain.toLowerCase()}.${root}`;
  }
  url.searchParams.set('token', token);
  return url.toString();
}

async function loadTenant(tenantId: Types.ObjectId | string | null | undefined) {
  if (!tenantId) return null;
  try {
    const Tenant = mongoose.models.Tenant || (await import('../models/Tenant')).default;
    return await Tenant.findById(tenantId)
      .select('subdomain name displayName')
      .lean<{ subdomain?: string; name?: string; displayName?: string } | null>();
  } catch {
    return null;
  }
}

export type InviteDelivery = 'sent' | 'not-configured' | 'failed';

/**
 * Email the set-password link. Never throws. When SMTP is not configured the invite stays
 * valid and can be re-sent with POST /api/users/:id/invite once email works.
 */
export async function sendSetPasswordEmail(options: {
  email: string;
  name: string;
  token: string;
  tenantId?: Types.ObjectId | string | null;
  kind?: 'invite' | 'reset';
}): Promise<InviteDelivery> {
  const masked = maskEmail(options.email);
  try {
    if (!isEmailConfigured()) {
      console.warn(`[invite] SMTP not configured; set-password email for ${masked} was not sent (re-send it from staff management).`);
      return 'not-configured';
    }
    const tenant = await loadTenant(options.tenantId);
    const url = buildSetPasswordUrl(options.token, tenant?.subdomain);
    const { subject, html, text } = generateSetPasswordEmail({
      name: options.name,
      clinicName: tenant?.displayName || tenant?.name,
      url,
      expiresInHours: INVITE_TTL_HOURS,
      kind: options.kind ?? 'invite',
    });
    const result = await sendEmail({ to: options.email, subject, html, text });
    if (!result.success) {
      console.error(`[invite] Failed to send set-password email to ${masked}`);
      return 'failed';
    }
    return 'sent';
  } catch {
    console.error(`[invite] Failed to send set-password email to ${masked}`);
    return 'failed';
  }
}
