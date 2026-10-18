import 'server-only';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import User from '@/models/User';
import {
  ACCESS_KEYS,
  ROLE_NAMES,
  STANDARD_ROLE,
  allowedKeys,
  type PersonalAccess,
  type RoleRow,
  type RolesPage,
} from '@/lib/roles';

export interface GrantDoc {
  _id: Types.ObjectId;
  resource: string;
  actions?: string[];
}

/** Fingerprint of a role's Permission documents; changes whenever any of them does. */
export function grantsVersion(docs: GrantDoc[]): string {
  const lines = docs.map((d) => `${d.resource}:${[...(d.actions ?? [])].sort().join(',')}`).sort();
  return createHash('sha1').update(lines.join('|')).digest('hex').slice(0, 16);
}

/** Catalogued "resource:action" keys the documents grant. */
export function grantKeys(docs: GrantDoc[]): string[] {
  const keys = new Set<string>();
  for (const d of docs) {
    for (const a of d.actions ?? []) {
      const key = `${d.resource}:${a}`;
      if (ACCESS_KEYS.has(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

export function loadRoleGrantDocs(tenantId: Types.ObjectId, roleId: Types.ObjectId | string) {
  return Permission.find({ tenantId, role: new Types.ObjectId(String(roleId)) })
    .select('resource actions')
    .lean<GrantDoc[]>();
}

/**
 * Everything /admin/roles shows: the clinic's roles with how many people hold each and what
 * their Permission documents grant, the standard roles this clinic doesn't have, and people
 * whose own permissions allow more than their role.
 */
export async function loadRolesPage(session: { tenantId?: string | null }): Promise<RolesPage> {
  await connectDB();
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) {
    throw new Error('This account is not linked to a clinic');
  }
  const tenantId = new Types.ObjectId(session.tenantId);

  const [roles, roleDocs, personalDocs, counts] = await Promise.all([
    Role.find({ tenantId })
      .select('name displayName description isActive level')
      .sort({ level: -1, displayName: 1 })
      .lean<{ _id: Types.ObjectId; name: string; displayName?: string; description?: string; isActive?: boolean }[]>(),
    Permission.find({ tenantId, role: { $ne: null } })
      .select('role resource actions')
      .lean<(GrantDoc & { role: Types.ObjectId })[]>(),
    Permission.find({ tenantId, user: { $ne: null } })
      .select('user resource actions')
      .lean<(GrantDoc & { user: Types.ObjectId })[]>(),
    User.aggregate<{ _id: Types.ObjectId | null; n: number }>([
      { $match: { tenantId, status: { $ne: 'inactive' } } },
      { $group: { _id: '$role', n: { $sum: 1 } } },
    ]),
  ]);

  const docsByRole = new Map<string, GrantDoc[]>();
  for (const d of roleDocs) {
    const id = String(d.role);
    docsByRole.set(id, [...(docsByRole.get(id) ?? []), d]);
  }
  const people = new Map(counts.map((c) => [String(c._id), c.n]));

  const rows: RoleRow[] = roles.map((r) => {
    const docs = docsByRole.get(String(r._id)) ?? [];
    return {
      _id: String(r._id),
      name: r.name,
      displayName: r.displayName?.trim() || STANDARD_ROLE[r.name as keyof typeof STANDARD_ROLE]?.displayName || r.name,
      description: r.description?.trim() || null,
      isActive: r.isActive !== false,
      people: people.get(String(r._id)) ?? 0,
      grants: grantKeys(docs),
      version: grantsVersion(docs),
    };
  });

  const have = new Set(rows.map((r) => r.name));
  const missing = ROLE_NAMES.filter((n) => !have.has(n)).map((name) => ({ name, displayName: STANDARD_ROLE[name].displayName }));

  // Personal permissions: only what goes beyond the person's role, for accounts that aren't closed.
  const docsByUser = new Map<string, GrantDoc[]>();
  for (const d of personalDocs) {
    const id = String(d.user);
    docsByUser.set(id, [...(docsByUser.get(id) ?? []), d]);
  }
  let personal: PersonalAccess[] = [];
  if (docsByUser.size > 0) {
    const users = await User.find({ tenantId, _id: { $in: [...docsByUser.keys()].map((id) => new Types.ObjectId(id)) }, status: { $ne: 'inactive' } })
      .select('name role')
      .lean<{ _id: Types.ObjectId; name?: string; role?: Types.ObjectId }[]>();
    const byId = new Map(rows.map((r) => [r._id, r]));
    personal = users
      .map((u) => {
        const role = u.role ? byId.get(String(u.role)) : undefined;
        const roleAllows = role ? allowedKeys(role) : new Set<string>();
        const keys = grantKeys(docsByUser.get(String(u._id)) ?? []).filter((k) => !roleAllows.has(k));
        return { userId: String(u._id), name: u.name?.trim() || 'Unnamed account', roleId: role?._id ?? null, keys };
      })
      .filter((p) => p.keys.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return { roles: rows, missing, personal };
}
