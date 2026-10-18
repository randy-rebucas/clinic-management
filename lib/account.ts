import 'server-only';
import type { Model } from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import Tenant from '@/models/Tenant';
import Admin from '@/models/Admin';
import Doctor from '@/models/Doctor';
import Nurse from '@/models/Nurse';
import Receptionist from '@/models/Receptionist';
import Accountant from '@/models/Accountant';
import AuditLog from '@/models/AuditLog';
import { createSession, revokeUserSessions, type SessionPayload } from '@/app/lib/dal';

/**
 * The signed-in staff member's own account: what /profile and /settings show and what
 * /api/account/* may change. Names and phone live on the role profile (Doctor, Nurse, …)
 * when there is one; User.name is kept in step with it.
 */

export const PROFILE_FIELDS = ['adminProfile', 'doctorProfile', 'nurseProfile', 'receptionistProfile', 'accountantProfile'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

// Every staff profile model requires a phone except Admin.
const PROFILE_MODELS: Record<ProfileField, { model: Model<any>; phoneRequired: boolean }> = {
  adminProfile: { model: Admin, phoneRequired: false },
  doctorProfile: { model: Doctor, phoneRequired: true },
  nurseProfile: { model: Nurse, phoneRequired: true },
  receptionistProfile: { model: Receptionist, phoneRequired: true },
  accountantProfile: { model: Accountant, phoneRequired: true },
};

export interface AccountProfile {
  field: ProfileField;
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  title: string;
  phoneRequired: boolean;
}

export interface AccountActivity {
  id: string;
  action: 'login' | 'password_change';
  at: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  roleName: string;
  roleLabel: string;
  clinicName: string | null;
  createdAt: string | null;
  totpEnabled: boolean;
  profile: AccountProfile | null;
  /** Set for doctors: their doctor record holds licences, hours and specialty. */
  doctorId: string | null;
}

type UserRow = {
  _id: { toString(): string };
  name: string;
  email: string;
  tenantId?: { toString(): string };
  role?: { name?: string; displayName?: string } | null;
  totpEnabled?: boolean;
  createdAt?: Date;
} & Partial<Record<ProfileField, { toString(): string } | null>>;

export function profileFieldOf(user: object): ProfileField | null {
  return PROFILE_FIELDS.find((field) => !!(user as Record<string, unknown>)[field]) ?? null;
}

export function profileModel(field: ProfileField) {
  return PROFILE_MODELS[field];
}

function roleLabel(role: UserRow['role']): string {
  if (role?.displayName) return role.displayName;
  const name = role?.name ?? 'staff';
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function loadAccount(userId: string): Promise<Account | null> {
  await connectDB();
  void Role; // registered for populate
  const user = await User.findById(userId)
    .select(`name email tenantId role totpEnabled createdAt ${PROFILE_FIELDS.join(' ')}`)
    .populate('role', 'name displayName')
    .lean<UserRow | null>();
  if (!user) return null;

  const field = profileFieldOf(user);
  let profile: AccountProfile | null = null;
  if (field) {
    const { model, phoneRequired } = PROFILE_MODELS[field];
    const doc = await model
      .findById(user[field])
      .select('firstName lastName phone title')
      .lean<{ _id: { toString(): string }; firstName?: string; lastName?: string; phone?: string; title?: string } | null>();
    if (doc) {
      profile = {
        field,
        id: doc._id.toString(),
        firstName: doc.firstName ?? '',
        lastName: doc.lastName ?? '',
        phone: doc.phone ?? '',
        title: doc.title ?? '',
        phoneRequired,
      };
    }
  }

  const tenant = user.tenantId
    ? await Tenant.findById(user.tenantId).select('name displayName').lean<{ name?: string; displayName?: string } | null>()
    : null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    roleName: user.role?.name ?? 'staff',
    roleLabel: roleLabel(user.role),
    clinicName: tenant?.displayName || tenant?.name || null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    totpEnabled: !!user.totpEnabled,
    profile,
    doctorId: field === 'doctorProfile' && profile ? profile.id : null,
  };
}

/**
 * End every session for this user except the one making the request: bump the session
 * version, then hand this browser a fresh cookie carrying the new version.
 */
export async function signOutOtherSessions(session: SessionPayload): Promise<void> {
  await revokeUserSessions(session.userId);
  await createSession(session.userId, session.email, session.role, session.roleId, session.tenantId);
}

/** The user's own recent sign-ins and password changes, newest first. */
export async function loadAccountActivity(userId: string, limit = 8): Promise<AccountActivity[]> {
  await connectDB();
  const rows = await AuditLog.find({ userId, action: { $in: ['login', 'password_change'] }, success: { $ne: false } })
    .select('action timestamp ipAddress userAgent')
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean<Array<{ _id: { toString(): string }; action: 'login' | 'password_change'; timestamp: Date; ipAddress?: string; userAgent?: string }>>();
  return rows.map((r) => ({
    id: r._id.toString(),
    action: r.action,
    at: new Date(r.timestamp).toISOString(),
    ipAddress: r.ipAddress || null,
    userAgent: r.userAgent || null,
  }));
}
