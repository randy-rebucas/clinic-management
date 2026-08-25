import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPermissionById, updatePermission, deletePermission } from '@/lib/data/permission';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET single permission - admin only
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
    const permission = await run(tenantId, () => getPermissionById(id));

    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: permission });
  } catch (error: any) {
    console.error('Error fetching permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch permission' },
      { status: 500 }
    );
  }
}

// PUT update permission - admin only
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
    const { id: _id, user, role, createdAt, updatedAt, ...rest } = body;

    const permission = await run(tenantId, async () => {
      try {
        return await updatePermission(id, {
          ...rest,
          ...(user !== undefined ? { user: user ? { connect: { id: user } } : { disconnect: true } } : {}),
          ...(role !== undefined ? { roles: role ? { set: [{ id: role }] } : { set: [] } } : {}),
        });
      } catch (err: any) {
        if (err.code === 'P2025') return null;
        throw err;
      }
    });

    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: permission });
  } catch (error: any) {
    console.error('Error updating permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update permission' },
      { status: 500 }
    );
  }
}

// DELETE permission - admin only
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
      const permission = await getPermissionById(id);
      if (!permission) {
        return { notFound: true as const };
      }

      // Deleting the Permission row automatically clears its User FK
      // (Permission.userId) and its membership in the Role<->Permission
      // many-to-many join — no separate $pull-equivalent writes needed.
      await deletePermission(id);
      return { deleted: true as const };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete permission' },
      { status: 500 }
    );
  }
}
