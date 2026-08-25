import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getTenantContext } from '@/lib/tenant';
import { getRoleById, updateRole, deleteRole, appRoleToRoleName } from '@/lib/data/role';
import { countUsers } from '@/lib/data/user';
import { createAuditLog } from '@/lib/audit';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET single role - admin only
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const role = await run(tenantId, () => getRoleById(id));

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error fetching role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch role' },
      { status: 500 }
    );
  }
}

// PUT update role - admin only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const body = await request.json();

    // Validate role name if provided
    const validRoleNames = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'];
    if (body.name && !validRoleNames.includes(body.name)) {
      return NextResponse.json(
        { success: false, error: `Role name must be one of: ${validRoleNames.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await run(tenantId, async () => {
      // Don't allow changing role name if it's a system role
      const role = await getRoleById(id);
      if (!role) {
        return { notFound: true as const };
      }

      const { id: _id, defaultPermissions, permissions, ...rest } = body;
      const updated = await updateRole(id, {
        ...rest,
        ...(body.name ? { name: appRoleToRoleName(body.name) } : {}),
      });

      return { role, updated };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: session.tenantId,
      action: 'update',
      resource: 'user',
      resourceId: id,
      description: `Updated role: ${result.role.name}`,
      changes: Object.keys(body).map((field) => ({ field, newValue: body[field] })),
    });

    return NextResponse.json({ success: true, data: result.updated });
  } catch (error: any) {
    console.error('Error updating role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update role' },
      { status: 500 }
    );
  }
}

// DELETE role - admin only (with safety checks)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;

    const result = await run(tenantId, async () => {
      const role = await getRoleById(id);
      if (!role) {
        return { notFound: true as const };
      }

      // Prevent deletion of admin role
      if (role.name === 'admin') {
        return { cannotDeleteSystemRole: true as const };
      }

      // Check if any users have this role
      const usersWithRole = await countUsers({ roleId: id });

      if (usersWithRole > 0) {
        return { usersAssigned: usersWithRole };
      }

      await deleteRole(id);
      return { role };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    if ('cannotDeleteSystemRole' in result) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete system role (admin)' },
        { status: 400 }
      );
    }

    if ('usersAssigned' in result) {
      return NextResponse.json(
        { success: false, error: `Cannot delete role: ${result.usersAssigned} user(s) are assigned this role` },
        { status: 400 }
      );
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: session.tenantId,
      action: 'delete',
      resource: 'user',
      resourceId: id,
      description: `Deleted role: ${result.role.name}`,
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete role' },
      { status: 500 }
    );
  }
}
