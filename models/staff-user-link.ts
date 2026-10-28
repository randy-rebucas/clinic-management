import mongoose, { Types } from 'mongoose';
import {
  generateInviteToken,
  inviteUpdate,
  randomUnusablePasswordHash,
  sendSetPasswordEmail,
} from '../lib/user-invite';

const NO_TENANT = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };

/** Users/roles belonging to the given tenant, or the tenant-less (system) set when there is none. */
export function tenantScope(tenantId?: Types.ObjectId | null): Record<string, unknown> {
  return tenantId ? { tenantId } : NO_TENANT;
}

/**
 * Resolve a role for a tenant: the tenant's own role first (in `names` order), then a tenant-less
 * system role. Never another tenant's role.
 */
export async function findTenantRole(names: string[], tenantId?: Types.ObjectId | null) {
  const Role = await getModel('Role', () => import('./Role'));
  if (tenantId) {
    for (const name of names) {
      const role = await Role.findOne({ name, tenantId });
      if (role) return role;
    }
  }
  for (const name of names) {
    const role = await Role.findOne({ name, ...NO_TENANT });
    if (role) return role;
  }
  return null;
}

async function getModel(name: string, load: () => Promise<unknown>) {
  if (!mongoose.models[name]) await load();
  return mongoose.models[name];
}

interface StaffProfileDoc {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  status?: string;
  tenantId?: Types.ObjectId | null;
}

/**
 * Fields for a brand-new login account: a password nobody knows, plus a set-password
 * invite. Returns the raw token separately; it is only ever put in the invite email.
 */
export async function newAccountCredentials(): Promise<{ fields: Record<string, unknown>; token: string }> {
  const invite = generateInviteToken();
  return {
    token: invite.token,
    fields: {
      password: await randomUnusablePasswordHash(),
      mustSetPassword: true,
      ...inviteUpdate(invite),
    },
  };
}

/** Send the invite without blocking (or failing) the caller's save. */
export function sendInviteInBackground(options: Parameters<typeof sendSetPasswordEmail>[0]): void {
  void sendSetPasswordEmail(options).catch(() => undefined);
}

/**
 * Create (or link) the login User for a staff profile, strictly within the profile's tenant.
 * An account with the same email in another clinic is never touched.
 * A new account cannot be used until its owner sets a password via the emailed invite.
 * Returns the id of a newly created user, or null.
 */
export async function ensureStaffUser(options: {
  doc: StaffProfileDoc;
  profileField: string;
  roleNames: string[];
  label: string;
}): Promise<Types.ObjectId | null> {
  const { doc, profileField, roleNames, label } = options;
  try {
    const User = await getModel('User', () => import('./User'));
    if (!User) {
      console.warn(`User model not registered; no account created for ${label}`);
      return null;
    }

    const tenantId = doc.tenantId || null;
    const scope = tenantScope(tenantId);

    const linked = await User.findOne({ [profileField]: doc._id, ...scope }).select('_id').lean();
    if (linked) return null;

    const email = doc.email.toLowerCase().trim();
    const existing = await User.findOne({ email, ...scope });
    if (existing) {
      if (!existing.get(profileField)) {
        existing.set(profileField, doc._id);
        await existing.save();
      }
      return null;
    }

    let role = await findTenantRole(roleNames, tenantId);
    if (!role && tenantId) {
      // A clinic onboarded before this role existed gets it now, with the standard access.
      const { findOrCreateStandardRole } = await import('../lib/standard-roles');
      role = await findOrCreateStandardRole(tenantId, roleNames[0]);
    }
    if (!role) {
      console.warn(`Role "${roleNames[0]}" not found; no user account created for ${label} ${doc._id}`);
      return null;
    }

    const name = `${doc.firstName} ${doc.lastName}`.trim();
    const { fields, token } = await newAccountCredentials();
    const userData: Record<string, unknown> = {
      name,
      email,
      ...fields,
      role: role._id,
      [profileField]: doc._id,
      status: doc.status === 'active' ? 'active' : 'inactive',
    };
    if (tenantId) userData.tenantId = tenantId;

    const user = await User.create(userData);
    sendInviteInBackground({ email, name, token, tenantId, kind: 'invite' });
    return user._id as Types.ObjectId;
  } catch (error: any) {
    // Never block saving the profile because the linked account could not be created.
    console.error(`Error creating user for ${label} ${doc._id}:`, error?.message);
    return null;
  }
}
