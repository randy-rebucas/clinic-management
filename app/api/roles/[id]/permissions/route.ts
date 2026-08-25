import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getRoleById, setRoleDefaultPermissions, setRolePermissions } from '@/lib/data/role';
import { listPermissions } from '@/lib/data/permission';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// Update role permissions - admin only
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
    const { defaultPermissions, permissionIds } = body;

    const result = await run(tenantId, async () => {
      const role = await getRoleById(id);
      if (!role) {
        return { notFound: true as const };
      }

      // Update default permissions if provided
      if (defaultPermissions !== undefined) {
        await setRoleDefaultPermissions(id, defaultPermissions);
      }

      // Update permission references if provided (tenant-scoped)
      if (permissionIds !== undefined) {
        // Validate all permission IDs exist (tenant-scoped)
        if (permissionIds.length > 0) {
          const permissions = await listPermissions({ id: { in: permissionIds } });
          if (permissions.length !== permissionIds.length) {
            return { invalidPermissionIds: true as const };
          }
        }
        await setRolePermissions(id, permissionIds);
      }

      const updated = await getRoleById(id, { withDefaultPermissions: true });
      return { updated };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    if ('invalidPermissionIds' in result) {
      return NextResponse.json(
        { success: false, error: 'Some permission IDs are invalid' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result.updated });
  } catch (error: any) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update role permissions' },
      { status: 500 }
    );
  }
}
