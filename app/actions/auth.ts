'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { LoginFormSchema, LoginFormState } from '@/app/lib/definitions';
import {
  createSession,
  deleteSession,
  createPending2fa,
  readPending2fa,
  clearPending2fa,
  revokeUserSessions,
  type StaffRole,
} from '@/app/lib/dal';
import { hashInviteToken, isInviteTokenFormat, validatePasswordPolicy, verifyInviteToken } from '@/lib/user-invite';
import { sanitizeEmail } from '@/app/lib/security';
import { getTenantContext } from '@/lib/tenant';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import { consumeRateLimit, resetRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';
import { verifyUserTotp } from '@/app/api/auth/2fa/totp';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const SET_PASSWORD_FIRST = 'Check your email to set your password.';
const MOBILE_APP_ONLY = 'Medical representative accounts sign in through the MyClinicSoft mobile app.';
const INVALID_INVITE = 'This link is invalid or has expired. Ask your administrator to send a new one.';

// Generous per-IP cap: a whole clinic may share one public IP
const STAFF_LOGIN_IP_LIMIT = { name: 'staff-login-ip', windowMs: 15 * 60 * 1000, maxRequests: 50 };
const SET_PASSWORD_IP_LIMIT = { name: 'set-password-ip', windowMs: 15 * 60 * 1000, maxRequests: 20 };
const SET_PASSWORD_TOKEN_LIMIT = { name: 'set-password-token', windowMs: 15 * 60 * 1000, maxRequests: 5 };

let dummyHash: string | null = null;
/** bcrypt hash used to keep response time constant when the account does not exist. */
function getDummyHash(): string {
  if (!dummyHash) dummyHash = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
  return dummyHash;
}

async function clientIp(): Promise<string> {
  try {
    return getClientIp(await headers());
  } catch {
    return 'unknown';
  }
}

/**
 * Count one attempt for this account. Limits apply per (account + IP) and, more loosely,
 * per account across all IPs, so one client cannot quickly lock the real user out.
 * Returns the wait in minutes when blocked.
 */
async function checkLoginLimits(ip: string, account: string): Promise<number | null> {
  const checks = [
    await consumeRateLimit(STAFF_LOGIN_IP_LIMIT, ip),
    await consumeRateLimit(rateLimiters.authAccount.config, ip, account),
    await consumeRateLimit(rateLimiters.authAccountGlobal.config, ip, account),
  ];
  const blocked = checks.find((c) => !c.allowed);
  return blocked ? Math.max(1, Math.ceil(blocked.retryAfter / 60)) : null;
}

type ResolvedRole = { roleName: StaffRole; roleId?: string };

async function resolveRole(user: any, tenantId: string | null): Promise<ResolvedRole> {
  // Helper function to find role by name with tenant context
  const findRoleByName = async (name: string): Promise<any> => {
    if (tenantId) {
      // First try tenant-scoped role
      const tenantRole = await Role.findOne({ name, tenantId });
      if (tenantRole) return tenantRole;
      // If not found, try global role
      return await Role.findOne({
        name,
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
      });
    }
    // No tenant, look for global role
    return await Role.findOne({ name });
  };

  // Helper function to determine role from user profile fields
  const determineRoleFromProfile = (u: any): string | null => {
    if (u.adminProfile) return 'admin';
    if (u.doctorProfile) return 'doctor';
    if (u.nurseProfile) return 'nurse';
    if (u.receptionistProfile) return 'receptionist';
    if (u.accountantProfile) return 'accountant';
    if (u.medicalRepresentativeProfile) return 'medical-representative';
    return null;
  };

  let roleName: StaffRole = 'receptionist';
  let roleId: string | undefined;

  const fallback = async () => {
    // Try to determine role from profile fields
    const profileRole = determineRoleFromProfile(user);
    if (profileRole) {
      const fallbackRole = await findRoleByName(profileRole);
      if (fallbackRole) {
        roleName = fallbackRole.name as StaffRole;
        roleId = fallbackRole._id.toString();
      }
    }
    // If still no roleId, try receptionist as last resort
    if (!roleId) {
      const fallbackRole = await findRoleByName('receptionist');
      if (fallbackRole) {
        roleId = fallbackRole._id.toString();
        console.warn('Using receptionist role as fallback', { userId: user._id });
      }
    }
  };

  if (user.role) {
    if (typeof user.role === 'object' && 'name' in user.role) {
      roleName = (user.role as any).name as StaffRole;
      roleId = (user.role as any)._id?.toString();
    } else {
      // Role is ObjectId, fetch it (consider tenant context if applicable)
      let roleDoc;
      if (tenantId) {
        roleDoc = await Role.findOne({ _id: user.role, tenantId });
        if (!roleDoc) {
          roleDoc = await Role.findOne({
            _id: user.role,
            $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
          });
        }
      } else {
        roleDoc = await Role.findById(user.role);
      }

      if (roleDoc) {
        roleName = roleDoc.name as StaffRole;
        roleId = roleDoc._id.toString();
      } else {
        console.error('Login error: Role not found by ID', { roleId: user.role, userId: user._id, tenantId });
        await fallback();
      }
    }
  } else {
    console.error('Login error: User has no role assigned', { userId: user._id });
    await fallback();
  }

  return { roleName, roleId };
}

async function auditLogin(user: any, roleName: string, ip: string, tenantId: string | null) {
  try {
    const { logLogin } = await import('@/lib/audit');
    const userAgent = (await headers()).get('user-agent') ?? undefined;
    await logLogin(user._id.toString(), user.email, roleName, ip, userAgent, tenantId ?? undefined);
  } catch (error) {
    // Don't fail login if audit logging fails
    console.error('Error logging login:', error);
  }
}

/**
 * A refused sign-in for an account that exists, so the audit log can show wrong passwords
 * and attempts on suspended or closed accounts. Unknown emails have no account to name and
 * are only rate-limited.
 */
async function auditFailedLogin(user: any, reason: string, ip: string, tenantId: string | null) {
  try {
    const { createAuditLog } = await import('@/lib/audit');
    await createAuditLog({
      userId: user._id.toString(),
      userEmail: user.email,
      userRole: (user.role as any)?.name,
      tenantId: tenantId ?? user.tenantId ?? undefined,
      action: 'login',
      resource: 'system',
      success: false,
      errorMessage: reason,
      ipAddress: ip,
      userAgent: (await headers()).get('user-agent') ?? undefined,
      description: `Sign-in refused: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`,
    });
  } catch (error) {
    console.error('Error logging refused sign-in:', error);
  }
}

/**
 * A sign-in with an email that has no account in this clinic: logged with the email exactly
 * as typed (trimmed to 254 characters), so guessing addresses shows up in the audit log.
 */
async function auditUnknownEmail(email: string, ip: string, tenantId: string | null) {
  try {
    const { createAuditLog } = await import('@/lib/audit');
    await createAuditLog({
      userEmail: email.slice(0, 254),
      tenantId: tenantId ?? undefined,
      action: 'login',
      resource: 'system',
      success: false,
      errorMessage: 'No account with this email',
      ipAddress: ip,
      userAgent: (await headers()).get('user-agent') ?? undefined,
      description: 'Sign-in refused: no account with this email',
    });
  } catch (error) {
    console.error('Error logging unknown-email sign-in:', error);
  }
}

function tenantUserQuery(email: string, tenantId: string | null): Record<string, unknown> {
  // Find user by email within tenant scope if tenant exists
  return tenantId
    ? { email, tenantId }
    : { email, $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
}

export async function login(
  state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  // Validate form fields
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;
  const sanitizedEmail = sanitizeEmail(email);
  let destination: string;

  try {
    const ip = await clientIp();

    // Get tenant context for multi-tenant support
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;
    const accountKey = `staff:${tenantId ?? 'global'}:${sanitizedEmail}`;

    const waitMinutes = await checkLoginLimits(ip, accountKey);
    if (waitMinutes) {
      return {
        errors: {
          email: [`Too many login attempts. Please try again in ${waitMinutes} minute(s).`],
        },
      };
    }

    await connectDB();

    const user = await User.findOne(tenantUserQuery(sanitizedEmail, tenantId))
      .populate('role', 'name displayName');

    // Always run bcrypt so response time does not reveal whether the account exists
    const passwordMatch = await bcrypt.compare(password, user?.password || getDummyHash());
    if (!user || !user.password || !passwordMatch) {
      // Not awaited either way: the response time must not reveal whether the account exists.
      if (user) void auditFailedLogin(user, user.password ? 'Wrong password' : 'No password set yet', ip, tenantId);
      else void auditUnknownEmail(sanitizedEmail, ip, tenantId);
      return { errors: { email: [INVALID_CREDENTIALS] } };
    }

    // Password is correct, so it is safe to say why access is refused
    if (user.mustSetPassword) {
      await auditFailedLogin(user, 'Invite not accepted yet', ip, tenantId);
      return { errors: { email: [SET_PASSWORD_FIRST] } };
    }
    if (user.status !== 'active') {
      await auditFailedLogin(user, user.status === 'suspended' ? 'Account is suspended' : 'Account is closed', ip, tenantId);
      return {
        errors: {
          email: ['Your account is not active. Please contact your administrator.'],
        },
      };
    }

    if ((user.role as any)?.name === 'medical-representative' || user.medicalRepresentativeProfile) {
      await auditFailedLogin(user, 'Medical representative account on the staff web login', ip, tenantId);
      return { errors: { email: [MOBILE_APP_ONLY] } };
    }

    await resetRateLimit(rateLimiters.authAccount.config, ip, accountKey);

    if (user.totpEnabled) {
      await createPending2fa(user._id.toString(), tenantId ?? undefined);
      destination = '/login/2fa';
    } else {
      const { roleName, roleId } = await resolveRole(user, tenantId);
      await createSession(
        user._id.toString(),
        user.email,
        roleName,
        roleId,
        tenantId || undefined,
        user.sessionVersion ?? 0
      );
      await auditLogin(user, roleName, ip, tenantId);
      revalidatePath('/dashboard');
      destination = '/dashboard';
    }
  } catch (error: any) {
    // Log full details server-side only — never expose error internals to the client
    console.error('Login error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return {
      message: 'An error occurred during login. Please try again.',
    };
  }

  redirect(destination);
}

export type TwoFactorFormState =
  | {
      errors?: { code?: string[] };
      message?: string;
    }
  | undefined;

/**
 * Second step of login for accounts with 2FA: verify the authenticator code against the
 * short-lived pending-2fa cookie, then issue the real session.
 */
export async function verifyLoginTotp(
  state: TwoFactorFormState,
  formData: FormData
): Promise<TwoFactorFormState> {
  const code = formData.get('code');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
    return { errors: { code: ['Enter the 6-digit code from your authenticator app.'] } };
  }

  let destination: string;
  try {
    const pending = await readPending2fa();
    if (!pending) {
      return { message: 'Your sign-in attempt expired. Please sign in again.' };
    }

    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;
    if ((pending.tenantId ?? null) !== (tenantId ?? null)) {
      await clearPending2fa();
      return { message: 'Your sign-in attempt expired. Please sign in again.' };
    }

    const ip = await clientIp();
    const accountKey = `2fa:${pending.userId}`;
    const waitMinutes = await checkLoginLimits(ip, accountKey);
    if (waitMinutes) {
      return { message: `Too many attempts. Please try again in ${waitMinutes} minute(s).` };
    }

    await connectDB();
    const user = await User.findById(pending.userId).populate('role', 'name displayName');
    if (!user || user.status !== 'active' || !user.totpEnabled) {
      await clearPending2fa();
      return { message: 'Your sign-in attempt expired. Please sign in again.' };
    }

    if (!(await verifyUserTotp(user._id.toString(), code))) {
      await auditFailedLogin(user, 'Wrong two-step code', ip, tenantId);
      return { errors: { code: ['Invalid or already used code. Please try again.'] } };
    }

    await resetRateLimit(rateLimiters.authAccount.config, ip, accountKey);
    await clearPending2fa();

    const { roleName, roleId } = await resolveRole(user, tenantId);
    await createSession(
      user._id.toString(),
      user.email,
      roleName,
      roleId,
      tenantId || undefined,
      user.sessionVersion ?? 0
    );
    await auditLogin(user, roleName, ip, tenantId);
    revalidatePath('/dashboard');
    destination = '/dashboard';
  } catch (error: any) {
    console.error('2FA login error:', { message: error?.message, name: error?.name });
    return { message: 'An error occurred during sign-in. Please try again.' };
  }

  redirect(destination);
}

export type SetPasswordFormState =
  | {
      errors?: { password?: string[]; confirmPassword?: string[] };
      message?: string;
      success?: boolean;
      loginPath?: string;
      /** The account signs in through the mobile app (medical representatives). */
      mobileApp?: boolean;
    }
  | undefined;

/**
 * Complete an invite or admin-triggered reset: validate the single-use token, store the
 * new password, clear the token and sign out every existing session.
 */
export async function setPasswordWithToken(
  state: SetPasswordFormState,
  formData: FormData
): Promise<SetPasswordFormState> {
  const token = formData.get('token');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (!isInviteTokenFormat(token)) {
    return { message: INVALID_INVITE };
  }

  try {
    const ip = await clientIp();
    const limits = [
      await consumeRateLimit(SET_PASSWORD_IP_LIMIT, ip),
      await consumeRateLimit(SET_PASSWORD_TOKEN_LIMIT, ip, token),
    ];
    const blocked = limits.find((c) => !c.allowed);
    if (blocked) {
      return { message: `Too many attempts. Please try again in ${Math.max(1, Math.ceil(blocked.retryAfter / 60))} minute(s).` };
    }

    await connectDB();
    const tokenHash = hashInviteToken(token);
    const user = await User.findOne({ inviteTokenHash: tokenHash })
      .select('+inviteTokenHash +inviteExpiresAt email tenantId medicalRepresentativeProfile')
      .lean<{
        _id: { toString(): string };
        email: string;
        tenantId?: { toString(): string };
        inviteTokenHash?: string;
        inviteExpiresAt?: Date;
        medicalRepresentativeProfile?: unknown;
      } | null>();
    if (!user || !verifyInviteToken(token, user)) {
      return { message: INVALID_INVITE };
    }

    const policyErrors = validatePasswordPolicy(password, { email: user.email });
    if (policyErrors.length) {
      return { errors: { password: policyErrors } };
    }
    if (password !== confirmPassword) {
      return { errors: { confirmPassword: ['Passwords do not match.'] } };
    }

    const passwordHash = await bcrypt.hash(password as string, 12);
    // Conditional on the same token so two concurrent submissions cannot both succeed.
    const updated = await User.findOneAndUpdate(
      { _id: user._id, inviteTokenHash: tokenHash, inviteExpiresAt: { $gt: new Date() } },
      {
        $set: { password: passwordHash, mustSetPassword: false },
        $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 },
      },
      { new: false, projection: { _id: 1 } }
    ).lean();
    if (!updated) {
      return { message: INVALID_INVITE };
    }

    const userId = user._id.toString();
    await revokeUserSessions(userId);

    try {
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog({
        userId,
        userEmail: user.email,
        tenantId: user.tenantId?.toString(),
        action: 'password_change',
        resource: 'user',
        resourceId: userId,
        description: 'Password set via invite/reset link',
        ipAddress: ip,
      });
    } catch (auditError) {
      console.error('Error logging password setup:', auditError);
    }

    return {
      success: true,
      // Medical representatives sign in through the mobile app; there is no web page to send them to.
      ...(user.medicalRepresentativeProfile ? { mobileApp: true } : { loginPath: '/login' }),
    };
  } catch (error: any) {
    console.error('Set password error:', { message: error?.message, name: error?.name });
    return { message: 'An error occurred. Please try again.' };
  }
}

export async function logout() {
  try {
    await deleteSession();
    await clearPending2fa();
    revalidatePath('/');
  } catch (error) {
    console.error('Error during logout:', error);
  }
  redirect('/login');
}
