import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listRoles, createRole, appRoleToRoleName } from '@/lib/data/role';
import { getUserById } from '@/lib/data/user';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET all roles - admin only
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const tenantContextForCheck = await getTenantContext();
  const tenantIdForCheck = session.tenantId || tenantContextForCheck.tenantId;

  // Only admin can view roles
  let isAdmin = session.role === 'admin';

  if (!isAdmin) {
    // Double-check against database (handles session role mismatch)
    try {
      const user = await run(tenantIdForCheck, () => getUserById(session.userId));

      if (user && user.role) {
        const roleName = user.role.name === 'admin' ? 'admin' : null;

        if (roleName === 'admin') {
          isAdmin = true; // Allow access if user is admin in database
        } else {
          return forbiddenResponse('Admin access required');
        }
      } else {
        return forbiddenResponse('Admin access required');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      return forbiddenResponse('Admin access required');
    }
  }

  if (!isAdmin) {
    return forbiddenResponse('Admin access required');
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const roles = await run(tenantId, () => listRoles());

    // Ensure we always return an array
    const rolesData = Array.isArray(roles) ? roles : [];

    return NextResponse.json({ success: true, data: rolesData });
  } catch (error: any) {
    console.error('Error fetching roles:', error);
    // Provide more detailed error information
    const errorMessage = error.message || error.toString() || 'Failed to fetch roles';
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// POST create new role - admin only
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can create roles
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    const body = await request.json();

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Validate role name
    const validRoleNames = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'];
    if (body.name && !validRoleNames.includes(body.name)) {
      return NextResponse.json(
        { success: false, error: `Role name must be one of: ${validRoleNames.join(', ')}` },
        { status: 400 }
      );
    }

    const role = await run(tenantId, () =>
      createRole({
        name: appRoleToRoleName(body.name),
        displayName: body.displayName,
        description: body.description,
        level: body.level,
        isActive: body.isActive ?? true,
        ...(Array.isArray(body.defaultPermissions) && body.defaultPermissions.length > 0
          ? { defaultPermissions: { create: body.defaultPermissions } }
          : {}),
      })
    );

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating role:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Role with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create role' },
      { status: 500 }
    );
  }
}
