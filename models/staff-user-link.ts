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
  $locals?: Record<string, unknown>;
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

/**
 * Set a bcrypt hash here before saving a new staff profile (doc.$locals.initialPasswordHash)
 * to create its account with that admin-chosen password instead of an emailed invite.
 * The account can sign in at once, without verifying the email address.
 */
export const INITIAL_PASSWORD_LOCAL = 'initialPasswordHash';
/** With INITIAL_PASSWORD_LOCAL: the same password encrypted (lib/encryption), stored as User.tempPassword. */
export const TEMP_PASSWORD_LOCAL = 'tempPasswordSealed';
/** Set to true on doc.$locals when ensureStaffUser created a new account (rather than linking one). */
export const ACCOUNT_CREATED_LOCAL = 'accountCreated';

/** Send the invite without blocking (or failing) the caller's save. */
export function sendInviteInBackground(options: Parameters<typeof sendSetPasswordEmail>[0]): void {
  void sendSetPasswordEmail(options).catch(() => undefined);
}

/**
 * Create (or link) the login User for a staff profile, strictly within the profile's tenant.
 * An account with the same email in another clinic is never touched.
 * A new account cannot be used until its owner sets a password via the emailed invite,
 * unless the admin chose a password up front (see INITIAL_PASSWORD_LOCAL).
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
    const presetHash = doc.$locals?.[INITIAL_PASSWORD_LOCAL];
    const sealed = doc.$locals?.[TEMP_PASSWORD_LOCAL];
    const credentials =
      typeof presetHash === 'string' && presetHash
        ? {
            fields: { password: presetHash, mustSetPassword: false, ...(typeof sealed === 'string' && sealed ? { tempPassword: sealed } : {}) },
            token: null,
          }
        : await newAccountCredentials();
    const userData: Record<string, unknown> = {
      name,
      email,
      ...credentials.fields,
      role: role._id,
      [profileField]: doc._id,
      status: doc.status === 'active' ? 'active' : 'inactive',
    };
    if (tenantId) userData.tenantId = tenantId;

    const user = await User.create(userData);
    if (doc.$locals) doc.$locals[ACCOUNT_CREATED_LOCAL] = true;
    if (credentials.token) sendInviteInBackground({ email, name, token: credentials.token, tenantId, kind: 'invite' });
    return user._id as Types.ObjectId;
  } catch (error: any) {
    // Never block saving the profile because the linked account could not be created.
    console.error(`Error creating user for ${label} ${doc._id}:`, error?.message);
    return null;
  }
}
