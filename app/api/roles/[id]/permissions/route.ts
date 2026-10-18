import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { ACCESS_KEYS, ACCESS_LABEL, ACCESS_RESOURCES, allowedKeys, isAdminRole } from '@/lib/roles';
import { grantKeys, grantsVersion, loadRoleGrantDocs } from '@/lib/roles-page';

const schema = z.object({
  /** Every "resource:action" the role should allow, from the catalogue in lib/roles.ts. */
  grants: z.array(z.string().max(60)).max(200),
  /** The version the editor started from; a different current version means someone else saved. */
  version: z.string().max(64),
});

/**
 * PUT /api/roles/[id]/permissions — admin only. Sets what a role allows by rewriting the
 * role's Permission documents, which the access checks read on every request. Resources the
 * page doesn't manage, and actions it doesn't show, are kept as they are.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Admin access required');
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Role');

    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const unknown = parsed.data.grants.filter((k) => !ACCESS_KEYS.has(k));
    if (unknown.length > 0) {
      return NextResponse.json({ success: false, error: `Not a permission this clinic uses: ${unknown.join(', ')}` }, { status: 400 });
    }

    const role = await Role.findOne(tenantFilter(tenantId, { _id: id }));
    if (!role) return notFound('Role');
    if (isAdminRole(role.name)) {
      return NextResponse.json(
        { success: false, error: 'Administrators can do everything, and that can’t be narrowed. Give someone a different role instead.' },
        { status: 400 }
      );
    }

    const docs = await loadRoleGrantDocs(tenantObjectId, role._id);
    if (grantsVersion(docs) !== parsed.data.version) {
      return NextResponse.json(
        { success: false, error: 'Someone else changed this role while you were editing. Reload to see their changes, then make yours again.' },
        { status: 409 }
      );
    }

    const before = allowedKeys({ name: role.name, grants: grantKeys(docs) });
    const wanted = new Set(parsed.data.grants);

    // Per resource: the actions the page shows come from `wanted`; any other action stays.
    const byResource = new Map<string, Set<string>>();
    for (const resource of ACCESS_RESOURCES) byResource.set(resource, new Set());
    for (const key of wanted) {
      const [resource, action] = key.split(':');
      byResource.get(resource)!.add(action);
    }
    for (const d of docs) {
      if (!ACCESS_RESOURCES.has(d.resource)) continue;
      for (const a of d.actions ?? []) {
        if (!ACCESS_KEYS.has(`${d.resource}:${a}`)) byResource.get(d.resource)!.add(a);
      }
    }

    const managed = docs.filter((d) => ACCESS_RESOURCES.has(d.resource)).map((d) => d._id);
    const created = await Permission.insertMany(
      [...byResource]
        .filter(([, actions]) => actions.size > 0)
        .map(([resource, actions]) => ({ tenantId: tenantObjectId, role: role._id, resource, actions: [...actions].sort() }))
    );
    if (managed.length > 0) await Permission.deleteMany({ tenantId: tenantObjectId, _id: { $in: managed } });

    const kept = docs.filter((d) => !ACCESS_RESOURCES.has(d.resource)).map((d) => d._id);
    role.permissions = [...kept, ...created.map((c) => c._id as Types.ObjectId)];
    await role.save();

    const after = await loadRoleGrantDocs(tenantObjectId, role._id);
    const now = allowedKeys({ name: role.name, grants: grantKeys(after) });
    const added = [...now].filter((k) => !before.has(k));
    const removed = [...before].filter((k) => !now.has(k));

    if (added.length > 0 || removed.length > 0) {
      await createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId,
        action: 'permission_change',
        resource: 'user',
        resourceId: role._id,
        description: `Changed what the ${role.displayName || role.name} role allows`,
        changes: [
          ...added.map((k) => ({ field: k, oldValue: 'not allowed', newValue: ACCESS_LABEL[k] })),
          ...removed.map((k) => ({ field: k, oldValue: ACCESS_LABEL[k], newValue: 'not allowed' })),
        ],
        metadata: { role: role.name },
      });
    }

    return NextResponse.json({
      success: true,
      data: { grants: grantKeys(after), version: grantsVersion(after), added, removed },
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json({ success: false, error: 'Failed to update role permissions' }, { status: 500 });
  }
}
