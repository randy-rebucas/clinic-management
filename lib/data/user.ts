/**
 * Data-access layer for the User model.
 *
 * User is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module. Functions here do not open their own context.
 *
 * Sensitive-field exclusion: `password` and `totpSecret` were Mongoose
 * `select: false` fields (see prisma/MIGRATION_NOTES.md) — Prisma has no
 * field-level default-exclusion, so this module is the enforcement point.
 * Every function here uses Prisma 7's `omit` API to strip both fields by
 * default. The ONE exception is `getUserByEmailWithPassword`, reserved for
 * login/credential verification — do not use it anywhere else.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

/** Default field omission applied to every non-sensitive query below. */
const omitSensitive = { password: true, totpSecret: true } satisfies Prisma.UserOmit;

/**
 * All six "one-of profile" relations a User may have. Exactly one (or none)
 * will be non-null on any given row — Prisma returns null for the FKs that
 * aren't set, so callers don't need to know in advance which profile type
 * a user has.
 */
const withOneOfProfile = {
  adminProfile: true,
  doctorProfile: true,
  nurseProfile: true,
  receptionistProfile: true,
  accountantProfile: true,
  medicalRepresentativeProfile: true,
} satisfies Prisma.UserInclude;

export interface GetUserByIdOptions {
  /** Include the resolved role (with its permissions). Default true. */
  withRole?: boolean;
}

const withRoleInclude = { role: { include: { permissions: true } } } satisfies Prisma.UserInclude;

function getUserByIdWithRole(id: string) {
  return prisma.user.findUnique({
    where: { id },
    omit: omitSensitive,
    include: withRoleInclude,
  });
}

function getUserByIdWithoutRole(id: string) {
  return prisma.user.findUnique({
    where: { id },
    omit: omitSensitive,
  });
}

// Two real implementations behind one dispatcher (rather than a single
// function with a runtime `include: cond ? x : undefined`) so the return
// type actually reflects whether `role` is included instead of collapsing
// to "role may or may not be present" under TypeScript's inference.
export function getUserById(id: string, opts: { withRole: false }): ReturnType<typeof getUserByIdWithoutRole>;
export function getUserById(id: string, opts?: GetUserByIdOptions): ReturnType<typeof getUserByIdWithRole>;
export function getUserById(id: string, opts: GetUserByIdOptions = {}) {
  const { withRole = true } = opts;
  return withRole ? getUserByIdWithRole(id) : getUserByIdWithoutRole(id);
}

/**
 * Fetch a user plus whichever single profile relation is actually set
 * (adminProfile / doctorProfile / nurseProfile / receptionistProfile /
 * accountantProfile / medicalRepresentativeProfile), replicating the
 * one-of-profile resolution today's routes do with Mongoose `.populate()`.
 * Password/totpSecret are excluded as always.
 */
export function getUserWithProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    omit: omitSensitive,
    include: {
      role: { include: { permissions: true } },
      ...withOneOfProfile,
    },
  });
}

export function getUserByEmail(email: string, tenantId?: string) {
  return prisma.user.findFirst({
    where: {
      email: email.toLowerCase().trim(),
      ...(tenantId ? { tenantId } : {}),
    },
    omit: omitSensitive,
    include: { role: { include: { permissions: true } } },
  });
}

/**
 * SENSITIVE / INTERNAL USE ONLY. Includes `password` for login credential
 * verification (bcrypt.compare). Do not expose the result of this function
 * to any API response — strip `password` before returning it to a caller
 * outside the login flow.
 */
export function getUserByEmailWithPassword(email: string, tenantId?: string) {
  return prisma.user.findFirst({
    where: {
      email: email.toLowerCase().trim(),
      ...(tenantId ? { tenantId } : {}),
    },
    omit: { totpSecret: true },
    include: { role: true },
  });
}

/**
 * SENSITIVE / INTERNAL USE ONLY. Returns just the TOTP fields, bypassing the
 * default `omitSensitive` exclusion — reserved for the 2FA setup/verify/
 * disable routes, which are the only legitimate readers/writers of
 * `totpSecret`. Do not expose the result outside those routes.
 */
export function getUserTotpSecret(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, totpSecret: true, totpEnabled: true },
  });
}

/**
 * The six "one-of profile" columns, in both their scalar (Unchecked*Input,
 * used by e.g. lib/data/staff.ts) and relation-object (connect/disconnect)
 * forms. Mongoose's `pre('save')` validated "cannot have multiple profile
 * types set simultaneously" and "profile must match role name" — Postgres
 * enforces neither (see prisma/MIGRATION_NOTES.md's "User" section), so
 * this module is the enforcement point for every createUser/updateUser call.
 */
const PROFILE_ID_FIELDS = [
  'adminProfileId',
  'doctorProfileId',
  'nurseProfileId',
  'receptionistProfileId',
  'accountantProfileId',
  'medicalRepresentativeProfileId',
] as const;
const PROFILE_RELATION_FIELDS = [
  'adminProfile',
  'doctorProfile',
  'nurseProfile',
  'receptionistProfile',
  'accountantProfile',
  'medicalRepresentativeProfile',
] as const;

export class UserProfileError extends Error {}

/** True if a relation-object field value represents "set" (a connect clause), as opposed to undefined/disconnect/null. */
function relationIsSet(v: any): boolean {
  return v !== undefined && v !== null && typeof v === 'object' && 'connect' in v && v.connect;
}

/** True if a relation-object field value represents "explicitly cleared" (disconnect / set null). */
function relationIsCleared(v: any): boolean {
  return v !== undefined && typeof v === 'object' && v !== null && ('disconnect' in v || ('set' in v && v.set == null));
}

/**
 * Returns the set of profile *Id field names touched by `data` (normalizing
 * away the scalar-vs-relation-object spelling difference), each mapped to
 * true (set) or false (explicitly cleared) — fields not mentioned in `data`
 * at all are omitted so callers can merge against the current DB row.
 */
function touchedProfileFields(data: Record<string, any>): Map<string, boolean> {
  const touched = new Map<string, boolean>();
  for (const field of PROFILE_ID_FIELDS) {
    if (data[field] !== undefined) touched.set(field, data[field] !== null && data[field] !== '');
  }
  for (const relField of PROFILE_RELATION_FIELDS) {
    if (data[relField] !== undefined) {
      const idField = `${relField}Id`;
      if (relationIsSet(data[relField])) touched.set(idField, true);
      else if (relationIsCleared(data[relField])) touched.set(idField, false);
    }
  }
  return touched;
}

/** Throws if more than one profile *Id field would end up set, after merging `touched` onto `currentlySet`. */
function assertSingleProfile(touched: Map<string, boolean>, currentlySet: Set<string>) {
  const resulting = new Set(currentlySet);
  for (const [field, isSet] of touched) {
    if (isSet) resulting.add(field);
    else resulting.delete(field);
  }
  if (resulting.size > 1) {
    throw new UserProfileError(
      `A user may have at most one profile type set (found: ${Array.from(resulting).join(', ')}).`
    );
  }
}

/** Which profile field a given Role.name should correspond to, if any (used for the "profile must match role name" check). */
const ROLE_TO_PROFILE_FIELD: Record<string, string> = {
  admin: 'adminProfileId',
  doctor: 'doctorProfileId',
  nurse: 'nurseProfileId',
  receptionist: 'receptionistProfileId',
  accountant: 'accountantProfileId',
  'medical-representative': 'medicalRepresentativeProfileId',
  medical_representative: 'medicalRepresentativeProfileId',
};

export async function createUser(data: Prisma.UserCreateInput | Prisma.UserUncheckedCreateInput) {
  const touched = touchedProfileFields(data as Record<string, any>);
  assertSingleProfile(touched, new Set());

  const setField = Array.from(touched.entries()).find(([, isSet]) => isSet)?.[0];
  if (setField) {
    const roleName = await resolveRoleName((data as any).role, (data as any).roleId);
    if (roleName && ROLE_TO_PROFILE_FIELD[roleName] && ROLE_TO_PROFILE_FIELD[roleName] !== setField) {
      throw new UserProfileError(`Profile type (${setField}) does not match the user's role (${roleName}).`);
    }
  }

  return prisma.user.create({
    data: data as Prisma.UserCreateInput,
    omit: omitSensitive,
    include: { role: true },
  });
}

export async function updateUser(id: string, data: Prisma.UserUpdateInput | Prisma.UserUncheckedUpdateInput) {
  const touched = touchedProfileFields(data as Record<string, any>);
  if (touched.size > 0) {
    const current = await prisma.user.findUnique({
      where: { id },
      select: {
        adminProfileId: true,
        doctorProfileId: true,
        nurseProfileId: true,
        receptionistProfileId: true,
        accountantProfileId: true,
        medicalRepresentativeProfileId: true,
      },
    });
    const currentlySet = new Set(
      current
        ? PROFILE_ID_FIELDS.filter((f) => (current as any)[f])
        : []
    );
    assertSingleProfile(touched, currentlySet);
  }

  return prisma.user.update({
    where: { id },
    data: data as Prisma.UserUpdateInput,
    omit: omitSensitive,
    include: { role: true },
  });
}

/** Resolve a Role.name from either a relation-object `role` field or a plain `roleId` scalar, for the profile/role-match check. */
async function resolveRoleName(role: any, roleId: string | undefined): Promise<string | undefined> {
  const id = roleId ?? (role && typeof role === 'object' && 'connect' in role ? role.connect?.id : undefined);
  if (!id) return undefined;
  const r = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  return r?.name;
}

export interface ListUsersOptions {
  skip?: number;
  take?: number;
}

export function listUsers(filter?: Prisma.UserWhereInput, opts: ListUsersOptions = {}) {
  return prisma.user.findMany({
    where: filter,
    omit: omitSensitive,
    include: { role: { select: { name: true, displayName: true, level: true } } },
    orderBy: { createdAt: 'desc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function countUsers(filter?: Prisma.UserWhereInput) {
  return prisma.user.count({ where: filter });
}

// ── Automation support (lib/automations/*) ───────────────────────────────────

/**
 * Active users whose Role.name is one of `roleNames` (report recipients,
 * usage-alert/trial-expiration/expiry-monitoring notification targets).
 * `roleNames` should already be in Prisma's RoleName spelling (see
 * lib/data/role.ts's appRoleToRoleName for the one hyphen/underscore
 * exception). Runs inside the caller's tenant context like every other
 * function in this module.
 */
export function listActiveUsersByRoleNames(roleNames: string[]) {
  return prisma.user.findMany({
    where: { status: 'active', role: { name: { in: roleNames as Prisma.EnumRoleNameFilter['in'] } } },
    omit: omitSensitive,
    include: { role: { select: { name: true } } },
  });
}

/** Fallback: any active users for the tenant (first N), used when no admin/accountant role match is found. */
export function listActiveUsersFallback(take = 5) {
  return prisma.user.findMany({
    where: { status: 'active' },
    omit: omitSensitive,
    take,
  });
}
