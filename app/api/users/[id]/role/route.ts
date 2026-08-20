import { NextRequest, NextResponse } from 'next/server';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { updateUser } from '@/lib/data/user';
import { getRoleById } from '@/lib/data/role';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

// Update user's role - admin only
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
    const { id } = await params;
    const body = await request.json();
    const { roleId } = body;

    if (!roleId) {
      return NextResponse.json(
        { success: false, error: 'roleId is required' },
        { status: 400 }
      );
    }

    // Explicit tenant branch: a resolved session.tenantId -> runWithTenant
    // (the extension auto-scopes both the Role lookup and the User update);
    // no tenantId (legacy no-subdomain mode) -> runAsSystem, since there is
    // no tenant to scope by.
    const tenantId = session.tenantId;
    const update = async () => {
      // Verify role exists (tenant-scoped by the active context)
      const role = await getRoleById(roleId);
      if (!role) {
        return { error: 'not_found_role' as const };
      }

      const user = await updateUser(id, { role: { connect: { id: roleId } } });
      return { user, roleName: role.name };
    };

    const result = tenantId ? await runWithTenant(tenantId, update) : await runAsSystem(update);

    if ('error' in result) {
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
      action: 'permission_change',
      resource: 'user',
      resourceId: id,
      description: `Changed role for user ${id} to ${result.roleName}`,
      changes: [{ field: 'role', newValue: result.roleName }],
    });

    return NextResponse.json({ success: true, data: result.user });
  } catch (error: any) {
    // Prisma throws P2025 when the update's `where` matches no row, unlike
    // Mongoose's findOneAndUpdate which returned null — surface it as the
    // same 404 the old code returned for "user not found".
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}
