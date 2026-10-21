import 'server-only';
import { cache } from 'react';
import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { deriveKey } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import { getTenantContext } from '@/lib/tenant';

/**
 * Platform admins: the people who run MyClinicSoft itself, not any one clinic.
 *
 * Who counts is the PLATFORM_ADMIN_EMAILS allowlist (comma-separated), checked on every
 * request, so removing an address ends that person's access at once. They sign in with a
 * single-use emailed link; the session lives in its own host-only `platform_session`
 * cookie on the root domain, signed with a key no clinic token shares.
 */

export const PLATFORM_COOKIE = 'platform_session';
const PLATFORM_SESSION_TTL_S = 8 * 60 * 60;
export const LOGIN_LINK_TTL_S = 15 * 60;
const VIEW_AS_HANDOFF_TTL_S = 60;

type PlatformTokenType = 'platform' | 'platform-login' | 'view-as';

function key(): Uint8Array {
  return new Uint8Array(deriveKey('platform-auth'));
}

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: unknown): email is string {
  return typeof email === 'string' && platformAdminEmails().includes(email.trim().toLowerCase());
}

async function sign(claims: Record<string, unknown>, typ: PlatformTokenType, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...claims, typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key());
}

async function verify(token: string | undefined | null, typ: PlatformTokenType) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.typ !== typ || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Record the token's jti as spent. False when it was already used. */
async function spend(jti: string, purpose: 'platform-login' | 'view-as', exp: number): Promise<boolean> {
  await connectDB();
  const PlatformNonce = (await import('@/models/PlatformNonce')).default;
  try {
    await PlatformNonce.create({ jti, purpose, expiresAt: new Date(exp * 1000) });
    return true;
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
}

// ── Sign-in links ─────────────────────────────────────────────────────────────

export async function issuePlatformLoginToken(email: string): Promise<string> {
  return sign({ email: email.trim().toLowerCase() }, 'platform-login', LOGIN_LINK_TTL_S);
}

/** Spend a sign-in link. Returns the email it was issued to, or null. */
export async function consumePlatformLoginToken(token: string | undefined | null): Promise<string | null> {
  const payload = await verify(token, 'platform-login');
  if (!payload || !isPlatformAdminEmail(payload.email)) return null;
  if (!(await spend(payload.jti!, 'platform-login', payload.exp!))) return null;
  return payload.email as string;
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface PlatformSession {
  email: string;
}

function platformCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
    // No domain: host-only, so the cookie never reaches clinic subdomains.
  };
}

export async function createPlatformSession(email: string): Promise<void> {
  const token = await sign({ email: email.trim().toLowerCase() }, 'platform', PLATFORM_SESSION_TTL_S);
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_COOKIE, token, platformCookieOptions(new Date(Date.now() + PLATFORM_SESSION_TTL_S * 1000)));
}

export async function deletePlatformSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_COOKIE, '', platformCookieOptions(new Date(0)));
}

export async function verifyPlatformToken(token: string | undefined): Promise<PlatformSession | null> {
  const payload = await verify(token, 'platform');
  if (!payload || !isPlatformAdminEmail(payload.email)) return null;
  return { email: payload.email as string };
}

/** The platform admin signed in on this request, or null. Never on a clinic subdomain. */
export const verifyPlatformSession = cache(async (): Promise<PlatformSession | null> => {
  try {
    const ctx = await getTenantContext();
    if (ctx.subdomain) return null;
    const cookieStore = await cookies();
    return await verifyPlatformToken(cookieStore.get(PLATFORM_COOKIE)?.value);
  } catch {
    return null;
  }
});

/** For platform pages: the session, or a redirect to the platform sign-in. */
export async function requirePlatformPage(): Promise<PlatformSession> {
  const ctx = await getTenantContext();
  if (ctx.subdomain) notFound();
  const session = await verifyPlatformSession();
  if (!session) redirect('/platform/login');
  return session;
}

/** For platform API routes: the session, or a 401 the caller returns. */
export async function requirePlatformApi(): Promise<PlatformSession | NextResponse> {
  const session = await verifyPlatformSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  return session;
}

export function isPlatformError(value: PlatformSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

// ── "View as clinic" hand-off ─────────────────────────────────────────────────

export interface ViewAsHandoff {
  tenantId: string;
  userId: string;
  platformEmail: string;
}

/**
 * The platform session cookie is host-only, so the clinic subdomain cannot read it. The
 * console mints this one-minute, single-use token and sends the browser to the clinic's
 * /api/platform/view-as, which spends it and sets the clinic's read-only session.
 */
export async function issueViewAsHandoff(h: ViewAsHandoff): Promise<string> {
  return sign({ ...h }, 'view-as', VIEW_AS_HANDOFF_TTL_S);
}

export async function consumeViewAsHandoff(token: string | undefined | null): Promise<ViewAsHandoff | null> {
  const payload = await verify(token, 'view-as');
  if (!payload) return null;
  const { tenantId, userId, platformEmail } = payload as Record<string, unknown>;
  if (typeof tenantId !== 'string' || typeof userId !== 'string' || !isPlatformAdminEmail(platformEmail)) return null;
  if (!(await spend(payload.jti!, 'view-as', payload.exp!))) return null;
  return { tenantId, userId, platformEmail };
}
