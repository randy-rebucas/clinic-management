import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listPermissions, createPermission } from '@/lib/data/permission';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET all permissions - admin only
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const roleId = searchParams.get('roleId');
    const resource = searchParams.get('resource');

    const where: Prisma.PermissionWhereInput = {};
    if (userId) where.userId = userId;
    if (roleId) where.roles = { some: { id: roleId } };
    if (resource) where.resource = resource;

    const permissions = await run(tenantId, () => listPermissions(where));

    return NextResponse.json({ success: true, data: permissions });
  } catch (error: any) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}

// POST create permission - admin only
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Validate that either user or role is provided, but not both
    if (!body.user && !body.role) {
      return NextResponse.json(
        { success: false, error: 'Either user or role must be provided' },
        { status: 400 }
      );
    }

    if (body.user && body.role) {
      return NextResponse.json(
        { success: false, error: 'Cannot assign permission to both user and role' },
        { status: 400 }
      );
    }

    const permission = await run(tenantId, async () => {
      const created = await createPermission({
        resource: body.resource,
        actions: body.actions ?? [],
        ...(body.user ? { user: { connect: { id: body.user } } } : {}),
        ...(body.role ? { roles: { connect: [{ id: body.role }] } } : {}),
      });

      // If permission is for a user, add it to user's permissions array
      // (implicit via `user: { connect }` above — User.permissions is the
      // reverse side of Permission.userId, so no separate write is needed.)

      return created;
    });

    return NextResponse.json({ success: true, data: permission }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create permission' },
      { status: 500 }
    );
  }
}
