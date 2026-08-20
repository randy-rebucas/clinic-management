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

export function createUser(data: Prisma.UserCreateInput) {
  return prisma.user.create({
    data,
    omit: omitSensitive,
    include: { role: true },
  });
}

export function updateUser(id: string, data: Prisma.UserUpdateInput) {
  return prisma.user.update({
    where: { id },
    data,
    omit: omitSensitive,
    include: { role: true },
  });
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
