import 'server-only';
import { cache } from 'react';
import { createHmac } from 'crypto';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

const secretKey = process.env.SESSION_SECRET;
// Only enforce SESSION_SECRET at runtime, not during build
// During build, Next.js sets NODE_ENV=production but we're not actually running
// We'll validate at runtime when functions are called instead of at module load
if (!secretKey && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[dal] SESSION_SECRET is not set. Using an insecure fallback key — ' +
    'tokens issued now will be invalid once a real secret is set.'
  );
}
const rawSecret =
  secretKey ||
  (process.env.NODE_ENV === 'production'
    ? ''
    : 'default-secret-key-change-in-production-dev-only');
const encodedKey = new TextEncoder().encode(rawSecret);

// Runtime validation function - call this when actually using the secret
function validateSecret() {
  if (!secretKey && process.env.NODE_ENV === 'production') {
    // Only throw if we're actually in a runtime context (not build)
    // Check if we're in a build by trying to detect build context
    const isBuildContext = process.env.NEXT_PHASE === 'phase-production-build' ||
                          process.env.NEXT_PHASE === 'phase-development-build';
    if (!isBuildContext) {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
  }
}

/**
 * Derive a purpose-specific key from SESSION_SECRET so tokens for one purpose
 * (calendar feeds, etc.) can never be confused with another.
 */
export function deriveKey(label: string): Buffer {
  validateSecret();
  return createHmac('sha256', rawSecret).update(`clinic-key:${label}`).digest();
}

/**
 * Every JWT signed with SESSION_SECRET carries a `typ` claim so a token minted for one
 * purpose (e.g. a 5-minute pending-2fa token) can never be replayed as another (a session).
 * 'socket' is no longer issued; tokens minted before Socket.IO was removed stay rejected.
 */
export type TokenType = 'session' | 'socket' | 'patient' | 'pending-2fa';

export type StaffRole = 'admin' | 'owner' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' | 'medical-technologist';

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  role: StaffRole; // Role name for backward compatibility
  roleId?: string; // Role ObjectId from database
  tenantId?: string; // Tenant ObjectId for multi-tenant support
  expiresAt: number | Date;
  typ?: 'session';
  sv?: number; // User.sessionVersion at issue time
  /**
   * Set when a platform admin is viewing this clinic ("view as clinic"): their email.
   * Such sessions are read-only (proxy.ts refuses every write) and last VIEW_AS_TTL_MS.
   */
  imp?: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_CHECK_TTL_MS = 30 * 1000;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires,
    sameSite: 'lax' as const,
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined, // Set apex domain for cross-subdomain auth
  };
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  validateSecret(); // Validate at runtime, not build time
  // Convert expiresAt to number if it's a Date for JWT compatibility
  const jwtPayload: JWTPayload = {
    ...payload,
    typ: 'session',
    sv: payload.sv ?? 0,
    expiresAt: payload.expiresAt instanceof Date ? payload.expiresAt.getTime() / 1000 : payload.expiresAt,
  };
  return new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    // Lets one session be signed out (revokeSessionToken) without ending the user's others.
    .setJti(crypto.randomUUID())
    .sign(encodedKey);
}

function expiresAtToDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === 'string' || value instanceof Date) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Verify a staff session JWT (signature, type and expiry only — no DB check).
 * Use verifySessionToken() when the caller needs revocation/status checks.
 */
export async function decrypt(session: string | undefined = ''): Promise<SessionPayload | null> {
  try {
    validateSecret(); // Validate at runtime, not build time
    if (!session) return null;
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    });

    const p = payload as Record<string, unknown>;
    if (
      typeof p.userId !== 'string' ||
      typeof p.email !== 'string' ||
      typeof p.role !== 'string'
    ) {
      return null;
    }

    // Tokens issued before `typ` existed are accepted only if they are full sessions
    // (they always had expiresAt; socket tokens never did).
    if (p.typ !== undefined && p.typ !== 'session') return null;
    if (p.imp !== undefined && typeof p.imp !== 'string') return null;

    const expiresAt = expiresAtToDate(p.expiresAt);
    if (!expiresAt || expiresAt < new Date()) {
      return null;
    }

    return payload as unknown as SessionPayload;
  } catch (error) {
    // Silently fail - session is invalid or expired
    return null;
  }
}

// ── Server-side session state (revocation, status, fresh role/tenant) ──────────

interface UserSessionState {
  active: boolean;
  sessionVersion: number;
  tenantId?: string;
  roleId?: string;
  roleName?: string;
  /** jti of sessions signed out one by one. */
  revoked: Set<string>;
}

const userStateCache = new Map<string, { state: UserSessionState | null; expires: number }>();

async function loadUserSessionState(userId: string): Promise<UserSessionState | null> {
  const cached = userStateCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.state;

  await connectDB();
  await import('@/models/Role');
  const user = await User.findById(userId)
    .select('status isActive sessionVersion tenantId role revokedSessions')
    .populate('role', 'name')
    .lean<{
      status?: string;
      isActive?: boolean;
      sessionVersion?: number;
      tenantId?: { toString(): string };
      role?: { _id?: { toString(): string }; name?: string } | { toString(): string };
      revokedSessions?: { jti: string; exp: Date }[];
    } | null>();

  let state: UserSessionState | null = null;
  if (user) {
    const role = user.role as { _id?: { toString(): string }; name?: string } | undefined;
    state = {
      active: user.status === 'active' && user.isActive !== false,
      sessionVersion: user.sessionVersion ?? 0,
      tenantId: user.tenantId ? user.tenantId.toString() : undefined,
      roleId: role && typeof role === 'object' && role._id ? role._id.toString() : undefined,
      roleName: role && typeof role === 'object' && typeof role.name === 'string' ? role.name : undefined,
      revoked: new Set((user.revokedSessions ?? []).map((r) => r.jti)),
    };
  }
  userStateCache.set(userId, { state, expires: Date.now() + SESSION_CHECK_TTL_MS });
  if (userStateCache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of userStateCache) if (entry.expires < now) userStateCache.delete(key);
  }
  return state;
}

/**
 * Verify a staff session token and check it against the database: the user must still
 * exist, be active, belong to the same tenant and carry the current sessionVersion.
 * Role and tenant are refreshed from the database.
 */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  const session = await decrypt(token);
  if (!session) return null;
  try {
    const state = await loadUserSessionState(session.userId);
    if (!state || !state.active) return null;
    if ((session.sv ?? 0) !== state.sessionVersion) return null;
    if (session.jti && state.revoked.has(session.jti)) return null;
    // The user must still belong to the tenant the session was issued for
    if (session.tenantId && state.tenantId !== session.tenantId) return null;

    return {
      ...session,
      role: (state.roleName as StaffRole | undefined) ?? session.role,
      roleId: state.roleId ?? session.roleId,
    };
  } catch (error) {
    console.error('[dal] Failed to verify session state:', error);
    return null;
  }
}

/**
 * Invalidate every session (cookies, bearer tokens, calendar feed links)
 * issued to this user. Call after password change, role change, deactivation.
 * Other server instances may accept old tokens for up to SESSION_CHECK_TTL_MS.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await connectDB();
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
  userStateCache.delete(String(userId));
}

/**
 * Sign out one session (logout): its token stops working, the user's other sessions don't.
 * Other server instances may accept it for up to SESSION_CHECK_TTL_MS.
 */
export async function revokeSessionToken(token: string | undefined): Promise<void> {
  const session = await decrypt(token);
  if (!session?.jti) return;
  const exp = typeof session.exp === 'number' ? new Date(session.exp * 1000) : new Date(Date.now() + SESSION_TTL_MS);
  await connectDB();
  // Entries past their token's expiry are dropped as new ones are added.
  await User.updateOne({ _id: session.userId }, { $pull: { revokedSessions: { exp: { $lt: new Date() } } } });
  await User.updateOne({ _id: session.userId }, { $push: { revokedSessions: { jti: session.jti, exp } } });
  userStateCache.delete(String(session.userId));
}

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/**
 * Sign a staff session JWT without setting a cookie. The same token works as the `session`
 * cookie or as `Authorization: Bearer` (mobile app), and is revoked by revokeUserSessions().
 */
export async function issueSessionToken(
  userId: string,
  email: string,
  role: StaffRole,
  roleId?: string,
  tenantId?: string,
  sessionVersion?: number
): Promise<{ token: string; expiresAt: Date }> {
  let sv = sessionVersion;
  if (sv === undefined) {
    await connectDB();
    const user = await User.findById(userId).select('sessionVersion').lean<{ sessionVersion?: number } | null>();
    sv = user?.sessionVersion ?? 0;
  }
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = await encrypt({ userId, email, role, roleId, tenantId, expiresAt, sv });
  userStateCache.delete(userId);
  return { token, expiresAt };
}

export async function createSession(
  userId: string,
  email: string,
  role: StaffRole,
  roleId?: string,
  tenantId?: string,
  sessionVersion?: number
) {
  try {
    const { token, expiresAt } = await issueSessionToken(userId, email, role, roleId, tenantId, sessionVersion);
    const cookieStore = await cookies();
    cookieStore.set('session', token, cookieOptions(expiresAt));
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export const VIEW_AS_TTL_MS = 30 * 60 * 1000;

/**
 * A read-only session for a platform admin viewing a clinic as its own admin user.
 * It names the platform admin in `imp`, runs out after 30 minutes and is never extended.
 */
export async function createViewAsSession(opts: {
  userId: string;
  email: string;
  role: StaffRole;
  roleId?: string;
  tenantId: string;
  sessionVersion: number;
  platformEmail: string;
}): Promise<void> {
  validateSecret();
  const expiresAt = new Date(Date.now() + VIEW_AS_TTL_MS);
  const token = await new SignJWT({
    userId: opts.userId,
    email: opts.email,
    role: opts.role,
    roleId: opts.roleId,
    tenantId: opts.tenantId,
    typ: 'session',
    sv: opts.sessionVersion,
    imp: opts.platformEmail,
    expiresAt: expiresAt.getTime() / 1000,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${VIEW_AS_TTL_MS / 1000}s`)
    .sign(encodedKey);
  userStateCache.delete(opts.userId);
  const cookieStore = await cookies();
  cookieStore.set('session', token, cookieOptions(expiresAt));
}

export async function updateSession() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    const payload = await verifySessionToken(session);

    if (!session || !payload) {
      return null;
    }
    // A view-as session keeps its 30-minute limit.
    if (payload.imp) return null;

    const expires = new Date(Date.now() + SESSION_TTL_MS);
    const res = await encrypt({ ...payload, expiresAt: expires });

    cookieStore.set('session', res, cookieOptions(expires));
  } catch (error) {
    console.error('Error updating session:', error);
    return null;
  }
}

export async function deleteSession() {
  try {
    const cookieStore = await cookies();
    // The token is ended server-side too, so a copy taken from this browser stops working.
    await revokeSessionToken(cookieStore.get('session')?.value).catch((error) =>
      console.error('Error revoking session:', error)
    );
    // Delete with domain to ensure cross-subdomain cookie is removed
    cookieStore.set('session', '', cookieOptions(new Date(0)));
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

/**
 * Verify the current user session from cookies (memoized per request).
 *
 * @returns SessionPayload if authenticated, null otherwise
 */
export const verifySession = cache(async (): Promise<SessionPayload | null> => {
  try {
    // Get cookies - await is required in Next.js 16
    const cookieStore = await cookies();
    if (!cookieStore) {
      return null;
    }

    const cookie = cookieStore.get('session')?.value;

    if (!cookie) {
      return null;
    }

    return await verifySessionToken(cookie);
  } catch (error) {
    // Silently fail - user is not authenticated
    // This handles cases where cookies() might not be available in certain contexts
    return null;
  }
});

export const getUser = cache(async () => {
  try {
    const session = await verifySession();
    if (!session) return null;

    await connectDB();

    // First get user without populating to check role type
    const user = await User.findById(session.userId)
      .select('-password -totpSecret -totpLastUsedStep')
      .lean();
    if (!user || Array.isArray(user)) return null;

    // Type assertion for lean() result
    const userObj = user as unknown as { _id: { toString(): string }; role?: any; [key: string]: any };

    // Handle role - could be ObjectId, string, or already populated object
    let roleData: { name: string; displayName?: string } | null = null;

    if (userObj.role) {
      // If role is already an object (populated), use it directly
      if (typeof userObj.role === 'object' && userObj.role !== null && 'name' in userObj.role) {
        roleData = {
          name: (userObj.role as any).name,
          displayName: (userObj.role as any).displayName,
        };
      }
      // If role is a string (legacy data or invalid ObjectId), look up by name
      else if (typeof userObj.role === 'string') {
        const Role = (await import('@/models/Role')).default;
        const roleDoc = await Role.findOne({ name: userObj.role }).lean();
        if (roleDoc && !Array.isArray(roleDoc)) {
          const roleObj = roleDoc as unknown as { name: string; displayName?: string };
          roleData = {
            name: roleObj.name,
            displayName: roleObj.displayName,
          };
        }
      }
      // If role is an ObjectId, populate it
      else {
        try {
          const Role = (await import('@/models/Role')).default;
          const roleDoc = await Role.findById(userObj.role).lean();
          if (roleDoc && !Array.isArray(roleDoc)) {
            const roleObj = roleDoc as unknown as { name: string; displayName?: string };
            roleData = {
              name: roleObj.name,
              displayName: roleObj.displayName,
            };
          }
        } catch (populateError) {
          // If populate fails (invalid ObjectId), try to find by name from session
          if (session.role) {
            const Role = (await import('@/models/Role')).default;
            const roleDoc = await Role.findOne({ name: session.role }).lean();
            if (roleDoc && !Array.isArray(roleDoc)) {
              const roleObj = roleDoc as unknown as { name: string; displayName?: string };
              roleData = {
                name: roleObj.name,
                displayName: roleObj.displayName,
              };
            }
          }
        }
      }
    }

    // Use role name from populated data or fallback to session role
    const roleName = roleData?.name || session.role || 'receptionist';

    return {
      ...userObj,
      _id: userObj._id.toString(),
      role: roleName, // Return role as string for compatibility
      roleData: roleData, // Include full role data if available
    };
  } catch (error) {
    console.error('Failed to get user:', error);
    return null;
  }
});

/**
 * Get the current authenticated user's ID from session
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await verifySession();
  return session?.userId || null;
}

// ── Pending second factor ──────────────────────────────────────────────────────

const PENDING_2FA_COOKIE = 'pending_2fa';
const PENDING_2FA_TTL_MS = 5 * 60 * 1000;

export interface Pending2faPayload {
  userId: string;
  tenantId?: string;
}

/**
 * A 5-minute token naming who is mid-login after a correct password. The web login keeps it
 * in a cookie; the mobile app receives it in the response body and sends it back with the code.
 */
export async function issuePending2faToken(userId: string, tenantId?: string): Promise<string> {
  validateSecret();
  return new SignJWT({ typ: 'pending-2fa', userId, tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(encodedKey);
}

export async function verifyPending2faToken(token: string | undefined): Promise<Pending2faPayload | null> {
  try {
    if (!token) return null;
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    if (payload.typ !== 'pending-2fa' || typeof payload.userId !== 'string') return null;
    return {
      userId: payload.userId,
      tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : undefined,
    };
  } catch {
    return null;
  }
}

/** After a correct password for a 2FA user: remember who is mid-login for 5 minutes. */
export async function createPending2fa(userId: string, tenantId?: string): Promise<void> {
  const expires = new Date(Date.now() + PENDING_2FA_TTL_MS);
  const token = await issuePending2faToken(userId, tenantId);
  const cookieStore = await cookies();
  cookieStore.set(PENDING_2FA_COOKIE, token, { ...cookieOptions(expires), sameSite: 'strict' });
}

export async function readPending2fa(): Promise<Pending2faPayload | null> {
  try {
    const cookieStore = await cookies();
    return await verifyPending2faToken(cookieStore.get(PENDING_2FA_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function clearPending2fa(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(PENDING_2FA_COOKIE, '', { ...cookieOptions(new Date(0)), sameSite: 'strict' });
  } catch {
    // ignore
  }
}

// ── Patient tokens ─────────────────────────────────────────────────────────────

export const PATIENT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** How the session was started: password, phone OTP, or a login QR. */
export type PatientAuthMethod = 'password' | 'otp' | 'qr';

export interface PatientSessionPayload {
  patientId: string;
  patientCode: string;
  type: 'patient';
  email: string;
  pv?: number; // Patient.sessionVersion at issue time
  /**
   * Clinic scope (Tenant ObjectId string). When present, the session may only see records of
   * that clinic: set for sign-ins whose credential was issued by one clinic's staff (a staff
   * login QR, a staff-set password). Absent = every clinic the patient belongs to.
   */
  tid?: string;
  /** How this token's sign-in was proven. Not carried through refresh (refreshed tokens have none). */
  amr?: PatientAuthMethod;
  /** eMCR account (EmcrAccount id) this sign-in belongs to: set for eMCR phone sign-ins. */
  acc?: string;
  /**
   * 'guardian': `patientId` is not the account holder but a record they manage (a parent with no
   * patient record of their own). Credential actions on that record are refused.
   */
  rel?: 'guardian';
  iat?: number;
  /**
   * Set (never signed into a token) when the request acts for a family member: `patientId` is the
   * family member and this is the signed-in record (app/lib/patient-auth.ts).
   */
  guardianId?: string;
}

export interface PatientTokenClaims {
  tid?: string | null;
  amr?: PatientAuthMethod;
  acc?: string | null;
  rel?: 'guardian' | null;
}

interface PatientTokenSubject {
  _id: { toString(): string };
  patientCode?: string | null;
  email?: string | null;
  sessionVersion?: number | null;
}

const OBJECT_ID_FORMAT = /^[0-9a-f]{24}$/i;

/** Sign a patient session / bearer token (cookie and mobile app share this format). */
export async function issuePatientToken(
  patient: PatientTokenSubject,
  claims: PatientTokenClaims = {}
): Promise<string> {
  validateSecret();
  const tid = claims.tid ? String(claims.tid) : undefined;
  if (tid && !OBJECT_ID_FORMAT.test(tid)) throw new Error('Invalid tid claim');
  const acc = claims.acc ? String(claims.acc) : undefined;
  if (acc && !OBJECT_ID_FORMAT.test(acc)) throw new Error('Invalid acc claim');
  return new SignJWT({
    typ: 'patient',
    type: 'patient',
    patientId: patient._id.toString(),
    patientCode: patient.patientCode ?? '',
    email: patient.email || `patient-${patient.patientCode ?? patient._id.toString()}@clinic.local`,
    pv: patient.sessionVersion ?? 0,
    ...(tid ? { tid } : {}),
    ...(claims.amr ? { amr: claims.amr } : {}),
    ...(acc ? { acc } : {}),
    ...(acc && claims.rel === 'guardian' ? { rel: 'guardian' } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PATIENT_TOKEN_TTL_SECONDS}s`)
    .sign(encodedKey);
}

/** Attach the patient_session cookie to a response. */
export function setPatientSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set('patient_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(Date.now() + PATIENT_TOKEN_TTL_SECONDS * 1000),
    path: '/',
  });
}

const patientStateCache = new Map<string, { state: { active: boolean; sessionVersion: number } | null; expires: number }>();

async function loadPatientSessionState(patientId: string) {
  const cached = patientStateCache.get(patientId);
  if (cached && cached.expires > Date.now()) return cached.state;
  await connectDB();
  const Patient = (await import('@/models/Patient')).default;
  const patient = await Patient.findById(patientId)
    .select('active sessionVersion')
    .lean<{ active?: boolean; sessionVersion?: number } | null>();
  const state = patient
    ? { active: patient.active !== false, sessionVersion: patient.sessionVersion ?? 0 }
    : null;
  patientStateCache.set(patientId, { state, expires: Date.now() + SESSION_CHECK_TTL_MS });
  if (patientStateCache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of patientStateCache) if (entry.expires < now) patientStateCache.delete(key);
  }
  return state;
}

const emcrAccountCache = new Map<string, { ok: boolean; expires: number }>();

/** An eMCR account still exists and is not disabled (cached like the patient state). */
async function emcrAccountUsable(accountId: string): Promise<boolean> {
  const cached = emcrAccountCache.get(accountId);
  if (cached && cached.expires > Date.now()) return cached.ok;
  await connectDB();
  const EmcrAccount = (await import('@/models/EmcrAccount')).default;
  const account = await EmcrAccount.findById(accountId).select('disabled').lean<{ disabled?: boolean } | null>();
  const ok = !!account && !account.disabled;
  emcrAccountCache.set(accountId, { ok, expires: Date.now() + SESSION_CHECK_TTL_MS });
  if (emcrAccountCache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of emcrAccountCache) if (entry.expires < now) emcrAccountCache.delete(key);
  }
  return ok;
}

/** Invalidate every patient token issued so far (e.g. after a password change). Returns the new version. */
export async function revokePatientSessions(patientId: string): Promise<number> {
  await connectDB();
  const Patient = (await import('@/models/Patient')).default;
  const updated = await Patient.findByIdAndUpdate(
    patientId,
    { $inc: { sessionVersion: 1 } },
    { new: true, projection: { sessionVersion: 1 } }
  ).lean<{ sessionVersion?: number } | null>();
  patientStateCache.delete(String(patientId));
  return updated?.sessionVersion ?? 0;
}

/**
 * Verify a signed patient JWT (patient_session cookie or mobile Bearer token).
 * Returns the decoded payload or null if missing / invalid / expired / revoked.
 * Staff session tokens and socket tokens are rejected.
 */
export async function verifyPatientSession(
  cookieValue: string | undefined
): Promise<PatientSessionPayload | null> {
  try {
    if (!cookieValue) return null;
    validateSecret();
    if (!rawSecret) return null;
    const { payload } = await jwtVerify(cookieValue, encodedKey, {
      algorithms: ['HS256'],
    });
    const p = payload as Record<string, unknown>;
    if (
      typeof p.patientId !== 'string' ||
      p.type !== 'patient' ||
      (p.typ !== undefined && p.typ !== 'patient') ||
      p.userId !== undefined
    ) {
      return null;
    }
    // A malformed scope claim must never fall back to "every clinic".
    if (p.tid !== undefined && (typeof p.tid !== 'string' || !OBJECT_ID_FORMAT.test(p.tid))) return null;
    if (p.amr !== undefined && p.amr !== 'password' && p.amr !== 'otp' && p.amr !== 'qr') return null;
    if (p.acc !== undefined && (typeof p.acc !== 'string' || !OBJECT_ID_FORMAT.test(p.acc))) return null;
    if (p.rel !== undefined && (p.rel !== 'guardian' || p.acc === undefined)) return null;
    // Older tokens were issued for 30 days; cap every token at the current TTL.
    if (typeof payload.iat === 'number' && Date.now() / 1000 - payload.iat > PATIENT_TOKEN_TTL_SECONDS) {
      return null;
    }

    const state = await loadPatientSessionState(p.patientId);
    if (!state || !state.active) return null;
    if ((typeof p.pv === 'number' ? p.pv : 0) !== state.sessionVersion) return null;
    if (typeof p.acc === 'string' && !(await emcrAccountUsable(p.acc))) return null;

    return payload as unknown as PatientSessionPayload;
  } catch {
    return null;
  }
}

/** Window in which an OTP sign-in counts as fresh proof of the patient's phone. */
export const PATIENT_OTP_FRESH_SECONDS = 15 * 60;

/** True when this token came straight from a phone-OTP sign-in in the last 15 minutes. */
export function isFreshOtpSession(session: Pick<PatientSessionPayload, 'amr' | 'iat'>): boolean {
  return (
    session.amr === 'otp' &&
    typeof session.iat === 'number' &&
    Date.now() / 1000 - session.iat <= PATIENT_OTP_FRESH_SECONDS
  );
}
