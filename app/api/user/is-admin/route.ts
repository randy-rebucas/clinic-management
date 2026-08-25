import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getUserById } from '@/lib/data/user';
import { findActiveAdminByEmail } from '@/lib/data/admin';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    // Get tenant context for multi-tenant support
    const tenantContext = await getTenantContext();
    const contextTenantId = session.tenantId || tenantContext.tenantId;

    // Get user with email, role, and tenantId
    const user = await run(contextTenantId, () => getUserById(session.userId as string));

    if (!user || !user.email) {
      return NextResponse.json({
        success: false,
        isAdmin: false,
        error: 'User not found',
      });
    }

    // Get user's tenantId (from user record or session)
    const userTenantId = user.tenantId || session.tenantId || contextTenantId;

    // Ensure tenant matching: user's tenant must match the context tenant
    if (contextTenantId && userTenantId && userTenantId !== contextTenantId) {
      return NextResponse.json({
        success: false,
        isAdmin: false,
        error: 'Tenant mismatch',
      });
    }

    // Use the user's tenantId for all checks (or context tenantId if user doesn't have one)
    const tenantId = userTenantId || contextTenantId;

    // Check if user has admin role (tenant-scoped)
    let hasAdminRole = false;
    if (user.role) {
      const roleName = user.role?.name;
      const roleTenantId = user.role?.tenantId || null;

      // If tenantId exists, ensure role belongs to same tenant
      if (roleName === 'admin') {
        if (tenantId) {
          // Role must belong to the same tenant
          if (!roleTenantId || roleTenantId === tenantId) {
            hasAdminRole = true;
          }
        } else {
          // No tenant context, allow if role has no tenant or matches
          if (!roleTenantId) {
            hasAdminRole = true;
          }
        }
      }
    }

    // Check if Admin profile exists with this email (tenant-scoped)
    let adminProfile = null;
    if (tenantId) {
      // Ensure admin profile belongs to the same tenant as the user
      adminProfile = await run(tenantId, () => findActiveAdminByEmail(user.email.toLowerCase().trim(), tenantId));
    } else {
      // If no tenant, check for admins without tenantId (backward compatibility)
      // But also ensure user doesn't have a tenantId
      if (!userTenantId) {
        adminProfile = await run(null, () => findActiveAdminByEmail(user.email.toLowerCase().trim(), null));
      } else {
        // User has tenantId but context doesn't - this shouldn't happen, but be safe
        return NextResponse.json({
          success: false,
          isAdmin: false,
          error: 'Tenant context required',
        });
      }
    }

    // User is admin if they have admin role OR admin profile exists
    // Both must be in the same tenant as the user
    const isAdmin = hasAdminRole || !!adminProfile;

    return NextResponse.json({
      success: true,
      isAdmin: isAdmin,
    });
  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json(
      { success: false, isAdmin: false, error: 'Failed to check admin status' },
      { status: 500 }
    );
  }
}
