/**
 * Data-access layer for "staff" as exposed by app/api/staff/* — which,
 * despite the name, has never operated on the generic (legacy/deprecated,
 * see prisma/schema.prisma's Staff model comment) Staff collection. It
 * operates on the three concrete staff profile models: Nurse, Receptionist,
 * Accountant. All three carry a direct `tenantId` column
 * (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts) — standard
 * runWithTenant(tenantId, fn)/runAsSystem(fn) scoping applies, and the
 * extension auto-stamps `tenantId` on every create() made inside
 * runWithTenant, so callers never set it manually.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 */
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';
import { runAsSystem } from '../tenant-context';
import { getRoleByName } from './role';

export type StaffType = 'nurse' | 'receptionist' | 'accountant';

function modelFor(staffType: StaffType) {
  switch (staffType) {
    case 'nurse':
      return prisma.nurse;
    case 'receptionist':
      return prisma.receptionist;
    case 'accountant':
      return prisma.accountant;
  }
}

/** The User column name holding the FK to this staff type's profile. */
export function profileIdField(staffType: StaffType): 'nurseProfileId' | 'receptionistProfileId' | 'accountantProfileId' {
  switch (staffType) {
    case 'nurse':
      return 'nurseProfileId';
    case 'receptionist':
      return 'receptionistProfileId';
    case 'accountant':
      return 'accountantProfileId';
  }
}

export interface StaffFilter {
  status?: string;
  search?: string;
}

function buildWhere(filter: StaffFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filter.status) where.status = filter.status;
  if (filter.search) {
    where.OR = [
      { firstName: { contains: filter.search, mode: 'insensitive' } },
      { lastName: { contains: filter.search, mode: 'insensitive' } },
      { email: { contains: filter.search, mode: 'insensitive' } },
      { employeeId: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export interface ListStaffOptions {
  skip?: number;
  take?: number;
}

export async function listStaffByType(staffType: StaffType, filter: StaffFilter, opts: ListStaffOptions = {}) {
  const model = modelFor(staffType) as any;
  const where = buildWhere(filter);
  const [rows, count] = await Promise.all([
    model.findMany({ where, orderBy: { createdAt: 'desc' }, skip: opts.skip, take: opts.take }),
    model.count({ where }),
  ]);
  return { rows: rows.map((r: any) => ({ ...r, staffType })), count };
}

/** Fetches all three staff types (uncapped, per the original 'all' branch's own 100-row-per-type cap). */
export async function listAllStaffTypes(filter: StaffFilter) {
  const where = buildWhere(filter);
  const [nurses, receptionists, accountants] = await Promise.all([
    (prisma.nurse.findMany as any)({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    (prisma.receptionist.findMany as any)({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    (prisma.accountant.findMany as any)({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return {
    nurses: nurses.map((n: any) => ({ ...n, staffType: 'nurse' })),
    receptionists: receptionists.map((r: any) => ({ ...r, staffType: 'receptionist' })),
    accountants: accountants.map((a: any) => ({ ...a, staffType: 'accountant' })),
  };
}

/** Look up a staff row by id, searching all three types if `staffType` is not given. */
export async function findStaffById(id: string, staffType?: StaffType | null) {
  if (staffType) {
    const model = modelFor(staffType) as any;
    const staff = await model.findUnique({ where: { id } });
    return staff ? { staff, staffType } : null;
  }

  const nurse = await prisma.nurse.findUnique({ where: { id } });
  if (nurse) return { staff: nurse, staffType: 'nurse' as const };

  const receptionist = await prisma.receptionist.findUnique({ where: { id } });
  if (receptionist) return { staff: receptionist, staffType: 'receptionist' as const };

  const accountant = await prisma.accountant.findUnique({ where: { id } });
  if (accountant) return { staff: accountant, staffType: 'accountant' as const };

  return null;
}

export async function getUserForStaff(id: string, staffType: StaffType) {
  const field = profileIdField(staffType);
  return prisma.user.findFirst({
    where: { [field]: id } as Prisma.UserWhereInput,
    select: { id: true, email: true, name: true, status: true, lastLogin: true },
  });
}

/**
 * Create a staff profile row. tenantId is auto-stamped by the tenant
 * extension when this runs inside runWithTenant(); no tenant handling here.
 */
export function createStaffProfile(staffType: StaffType, data: Record<string, any>) {
  const model = modelFor(staffType) as any;
  return model.create({ data });
}

export function updateStaffProfile(staffType: StaffType, id: string, data: Record<string, any>) {
  const model = modelFor(staffType) as any;
  return model.update({ where: { id }, data });
}

export function deleteStaffProfile(staffType: StaffType, id: string) {
  const model = modelFor(staffType) as any;
  return model.delete({ where: { id } });
}

export async function updateUserForStaff(id: string, staffType: StaffType, data: Prisma.UserUpdateInput) {
  const field = profileIdField(staffType);
  const user = await prisma.user.findFirst({ where: { [field]: id } as Prisma.UserWhereInput });
  if (!user) return null;
  return prisma.user.update({ where: { id: user.id }, data });
}

export async function deleteUserForStaff(id: string, staffType: StaffType) {
  const field = profileIdField(staffType);
  const user = await prisma.user.findFirst({ where: { [field]: id } as Prisma.UserWhereInput });
  if (!user) return null;
  await prisma.user.delete({ where: { id: user.id } });
  return user;
}

/**
 * Replicates the Mongoose Nurse/Receptionist/Accountant post-save hook that
 * auto-created a linked User account. Prisma has no such hooks, so the
 * caller (POST /api/staff) drives this explicitly right after creating the
 * profile row, inside the same tenant context.
 *
 * Role lookup mirrors the original hook's fallback chain: try a
 * tenant-scoped Role named `staffType` first, then fall back to a global
 * (tenantId-null) role of the same name via runAsSystem (the tenant
 * extension always scopes Role reads to the active tenant, so the global
 * fallback has to explicitly step outside that scope).
 */
export async function createUserForStaff(
  staffType: StaffType,
  staff: { id: string; firstName: string; lastName: string; email: string; phone: string; employeeId?: string | null; status: string },
  tenantId: string | null
) {
  const existingByEmail = await prisma.user.findFirst({ where: { email: staff.email.toLowerCase().trim() } });
  if (existingByEmail) {
    const field = profileIdField(staffType);
    if (!(existingByEmail as any)[field]) {
      await prisma.user.update({ where: { id: existingByEmail.id }, data: { [field]: staff.id } as Prisma.UserUncheckedUpdateInput });
    }
    return null;
  }

  let role = await getRoleByName(staffType as any);
  if (!role) {
    role = await runAsSystem(() => getRoleByName(staffType as any));
  }
  if (!role) {
    return null;
  }

  const defaultPassword = `Staff${staff.employeeId?.slice(-4) || staff.phone.slice(-4)}!`;
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  const field = profileIdField(staffType);

  const user = await prisma.user.create({
    data: {
      name: `${staff.firstName} ${staff.lastName}`.trim(),
      email: staff.email.toLowerCase().trim(),
      password: hashedPassword,
      role: { connect: { id: role.id } },
      status: staff.status === 'active' ? 'active' : 'inactive',
      [field]: staff.id,
    } as unknown as Prisma.UserUncheckedCreateInput,
  });

  return { user, defaultPassword };
}
