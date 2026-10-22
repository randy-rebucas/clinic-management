'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  consumePlatformLoginToken,
  createPlatformSession,
  deletePlatformSession,
  isPlatformAdminEmail,
  issuePlatformLoginToken,
  LOGIN_LINK_TTL_S,
} from '@/lib/platform-auth';
import { generatePlatformLoginEmail, isEmailConfigured, sendEmail } from '@/lib/email';
import { maskEmail } from '@/lib/user-invite';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { getTenantContext } from '@/lib/tenant';

export type PlatformLinkState = { sent?: boolean; error?: string } | undefined;

const LINK_IP_LIMIT = { name: 'platform-link-ip', windowMs: 15 * 60 * 1000, maxRequests: 10 };
const LINK_EMAIL_LIMIT = { name: 'platform-link-email', windowMs: 60 * 60 * 1000, maxRequests: 5, identifierOnly: true };

/**
 * Issue a sign-in link to an allowlisted platform admin. The answer is the same whether or
 * not the address is allowed, so the form does not reveal who the admins are.
 */
export async function requestPlatformLink(_state: PlatformLinkState, formData: FormData): Promise<PlatformLinkState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };

  const ctx = await getTenantContext();
  if (ctx.subdomain) return { error: 'The platform console is only on the main domain.' };

  const h = await headers();
  const ip = getClientIp(h);
  const limits = [await consumeRateLimit(LINK_IP_LIMIT, ip), await consumeRateLimit(LINK_EMAIL_LIMIT, ip, email)];
  if (limits.some((l) => !l.allowed)) return { error: 'Too many requests. Try again in a few minutes.' };

  if (isPlatformAdminEmail(email)) {
    const token = await issuePlatformLoginToken(email);
    // The configured base URL, not the request's Host header, so a forged Host cannot point the link elsewhere.
    const url = new URL('/platform/login/verify', process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    url.searchParams.set('token', token);
    // The link signs in to the super-admin console, so it goes to the server log only in
    // development, or when PLATFORM_LINK_TO_LOG=true is set on purpose (anyone who can read the
    // logs can then sign in; turn it off once email works).
    if (process.env.NODE_ENV === 'development' || process.env.PLATFORM_LINK_TO_LOG === 'true') {
      console.info(`[platform] Sign-in link for ${email}: ${url}`);
      if (!isEmailConfigured()) return { sent: true };
    }
    const { subject, html, text } = generatePlatformLoginEmail({ url: url.toString(), expiresInMinutes: LOGIN_LINK_TTL_S / 60 });
    const result = await sendEmail({ to: email, subject, html, text });
    // The answer stays the same either way; a failure is only logged, without the link.
    if (!result.success) console.error(`[platform] Sign-in email to ${maskEmail(email)} was not sent: ${result.error}`);
  }
  return { sent: true };
}

export type PlatformVerifyState = { error?: string } | undefined;

/**
 * Spend the emailed link. A button press, not the link's GET, does this, so mail scanners
 * that open links cannot use it up.
 */
export async function confirmPlatformLink(_state: PlatformVerifyState, formData: FormData): Promise<PlatformVerifyState> {
  const email = await consumePlatformLoginToken(String(formData.get('token') ?? ''));
  if (!email) return { error: 'This link is invalid, expired or already used. Ask for a new one.' };
  await createPlatformSession(email);
  redirect('/platform');
}

export async function platformLogout(): Promise<void> {
  await deletePlatformSession();
  redirect('/platform/login');
}
