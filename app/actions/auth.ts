'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SignupFormSchema, LoginFormSchema, SignupFormState, LoginFormState } from '@/app/lib/definitions';
import { createSession, deleteSession, verifySession } from '@/app/lib/dal';
import { sanitizeEmail, checkRateLimit, resetRateLimit } from '@/app/lib/security';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getUserByEmail, getUserByEmailWithPassword, createUser } from '@/lib/data/user';
import { getRoleByName, createRole, roleNameToAppRole, appRoleToRoleName } from '@/lib/data/role';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

type StaffRoleName = 'admin' | 'owner' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';

export async function signup(
  state: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  // Require an authenticated admin or owner session
  const callerSession = await verifySession();
  if (!callerSession || !['admin', 'owner'].includes(callerSession.role)) {
    return { message: 'Unauthorized. Only admins can create staff accounts.' };
  }

  // Rate limit by caller userId to prevent spam
  const rateLimitCheck = checkRateLimit(`signup:${callerSession.userId}`);
  if (!rateLimitCheck.allowed) {
    return {
      message: `Too many signup attempts. Please try again in ${rateLimitCheck.remainingTime} minute(s).`,
    };
  }

  // Validate form fields
  const validatedFields = SignupFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') || 'receptionist',
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { name, email, password, role } = validatedFields.data;
  const sanitizedEmail = sanitizeEmail(email);

  try {
    // Get tenant context for multi-tenant support (already Prisma-backed)
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    // Explicit tenant branch, per migration policy: a resolved tenant runs
    // the whole DB-touching sequence under runWithTenant so the extension
    // auto-scopes every User/Role query+create; no tenant runs under
    // runAsSystem and we pass tenantId-less filters ourselves (matching the
    // old Mongoose `$or: [{tenantId:{$exists:false}}, {tenantId:null}]`
    // legacy-mode semantics as closely as a nullable Postgres column allows).
    const result = tenantId
      ? await runWithTenant(tenantId, () => doSignup({ name, email: sanitizedEmail, password, role, tenantId }))
      : await runAsSystem(() => doSignup({ name, email: sanitizedEmail, password, role, tenantId: null }));

    if (!result.ok) return result.state;

    await createSession(
      result.userId,
      result.email,
      result.roleName,
      result.roleId,
      tenantId || undefined
    );
  } catch (error) {
    console.error('Signup error:', error);
    return {
      message: 'An error occurred during signup. Please try again.',
    };
  }

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

async function doSignup(params: {
  name: string;
  email: string;
  password: string;
  role: StaffRoleName;
  tenantId: string | null;
}): Promise<
  | { ok: false; state: SignupFormState }
  | { ok: true; userId: string; email: string; roleName: StaffRoleName; roleId: string }
> {
  const { name, email, password, role, tenantId } = params;

  // Check if user already exists (case-insensitive, within tenant scope if
  // tenant exists; getUserByEmail(email) with no tenantId arg omits the
  // tenantId condition entirely, which combined with the runAsSystem bypass
  // above searches across all tenants + untenanted users).
  const existingUser = tenantId ? await getUserByEmail(email, tenantId) : await getUserByEmail(email);
  if (existingUser) {
    return {
      ok: false,
      state: {
        errors: {
          email: ['An account with this email already exists.'],
        },
      },
    };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Get or create the role.
  // NOTE: Prisma's RoleName enum (see prisma/schema.prisma) does not include
  // 'owner' — this mirrors a pre-existing gap from before this migration
  // (Mongoose's Role.name was a free-form string) and is out of scope to
  // redesign here. If `role === 'owner'` is ever actually submitted this
  // will fail at the Postgres enum constraint; that failure surfaces via
  // the catch block in signup() above, same as any other DB error.
  const roleName = appRoleToRoleName(role);
  let roleDoc = await getRoleByName(roleName);
  if (!roleDoc) {
    const displayName = role.charAt(0).toUpperCase() + role.slice(1);
    roleDoc = await createRole({
      name: roleName,
      displayName,
      isActive: true,
      ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
    } as Prisma.RoleCreateInput);
  }

  const user = await createUser({
    name,
    email,
    password: hashedPassword,
    role: { connect: { id: roleDoc.id } },
    ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
  } as Prisma.UserCreateInput);

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    roleName: roleNameToAppRole(roleDoc.name) as StaffRoleName,
    roleId: roleDoc.id,
  };
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

  try {
    // Rate limiting check
    const rateLimitCheck = checkRateLimit(sanitizedEmail);
    if (!rateLimitCheck.allowed) {
      return {
        errors: {
          email: [
            `Too many login attempts. Please try again in ${rateLimitCheck.remainingTime} minute(s).`,
          ],
        },
      };
    }

    // Get tenant context for multi-tenant support (already Prisma-backed)
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    // Explicit tenant branch (see migration policy comment in signup()
    // above): resolved tenant -> runWithTenant, auto-scoped queries; no
    // tenant -> runAsSystem + tenantId-less filters passed explicitly.
    const result = tenantId
      ? await runWithTenant(tenantId, () => doLogin(sanitizedEmail, password, tenantId))
      : await runAsSystem(() => doLogin(sanitizedEmail, password, null));

    if (!result.ok) return result.state;

    // Create session with role name, roleId, and tenantId
    await createSession(
      result.userId,
      result.email,
      result.roleName,
      result.roleId,
      tenantId || undefined
    );

    // Log login for audit trail. lib/audit.ts is still Mongoose-based — it
    // is a later Phase 5 batch (AuditLog), so this batch intentionally keeps
    // calling it as-is against Mongo rather than migrating it here.
    try {
      const { logLogin } = await import('@/lib/audit');
      await logLogin(
        result.userId,
        result.email,
        result.roleName,
        undefined, // IP address would need to be passed from request
        undefined // User agent would need to be passed from request
      );
    } catch (error) {
      // Don't fail login if audit logging fails
      console.error('Error logging login:', error);
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

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

async function doLogin(
  email: string,
  password: string,
  tenantId: string | null
): Promise<
  | { ok: false; state: LoginFormState }
  | { ok: true; userId: string; email: string; roleName: StaffRoleName; roleId?: string }
> {
  // Find user by email (case-insensitive, within tenant scope if tenant
  // exists) with role populated. getUserByEmail(email) with no tenantId arg
  // omits the tenantId condition entirely — combined with the runAsSystem
  // bypass, this searches across all tenants + untenanted users, matching
  // today's Mongoose `$or` legacy-mode semantics as closely as Postgres's
  // nullable-column model allows.
  const user = tenantId ? await getUserByEmailWithPassword(email, tenantId) : await getUserByEmailWithPassword(email);

  if (!user) {
    // Use generic error message to prevent user enumeration
    return {
      ok: false,
      state: {
        errors: {
          email: ['Invalid email or password.'],
        },
      },
    };
  }

  // Check if user has a password
  if (!user.password) {
    console.error('Login error: User has no password set', { userId: user.id, email: user.email });
    return {
      ok: false,
      state: {
        errors: {
          email: ['Invalid email or password.'],
        },
      },
    };
  }

  // Check if user is active
  if (user.status !== 'active') {
    return {
      ok: false,
      state: {
        errors: {
          email: ['Your account is not active. Please contact your administrator.'],
        },
      },
    };
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    // Use generic error message to prevent user enumeration
    return {
      ok: false,
      state: {
        errors: {
          email: ['Invalid email or password.'],
        },
      },
    };
  }

  // Reset rate limit on successful login
  resetRateLimit(email);

  // Helper: determine role from user profile fields (fallback chain, last resort)
  const determineRoleFromProfile = (u: typeof user): StaffRoleName | null => {
    if (u.adminProfileId) return 'admin';
    if (u.doctorProfileId) return 'doctor';
    if (u.nurseProfileId) return 'nurse';
    if (u.receptionistProfileId) return 'receptionist';
    if (u.accountantProfileId) return 'accountant';
    if (u.medicalRepresentativeProfileId) return 'medical-representative';
    return null;
  };

  // getUserByEmailWithPassword already includes `role` (a required FK on
  // User in Prisma — unlike Mongoose there is no "role missing entirely"
  // case), so the role-resolution fallback chain collapses to: role always
  // present -> use it. The profile-derived / receptionist-fallback branches
  // are kept (dead in the required-FK-present case) only to preserve
  // exact behavioral parity in case `user.role` is ever unexpectedly falsy.
  let roleName: StaffRoleName = 'receptionist';
  let roleId: string | undefined;

  if (user.role) {
    roleName = roleNameToAppRole(user.role.name) as StaffRoleName;
    roleId = user.role.id;
  } else {
    console.error('Login error: User has no role assigned', {
      userId: user.id,
      email: user.email,
    });
    const profileRole = determineRoleFromProfile(user);
    if (profileRole) {
      const fallbackRole = await getRoleByName(appRoleToRoleName(profileRole));
      if (fallbackRole) {
        roleName = roleNameToAppRole(fallbackRole.name) as StaffRoleName;
        roleId = fallbackRole.id;
      }
    }
    if (!roleId) {
      const fallbackRole = await getRoleByName('receptionist');
      if (fallbackRole) {
        roleId = fallbackRole.id;
        console.warn('⚠️  Using receptionist role as fallback', { userId: user.id, email: user.email });
      }
    }
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    roleName,
    roleId,
  };
}

export async function loginMedicalRep() {
  try {
    await deleteSession();
    revalidatePath('/');
  } catch (error) {
    console.error('Error during medical representative login:', error);
  }
  redirect('/medical-representatives/login');
}

export async function logout() {
  try {
    await deleteSession();
    revalidatePath('/');
  } catch (error) {
    console.error('Error during logout:', error);
  }
  redirect('/login');
}
