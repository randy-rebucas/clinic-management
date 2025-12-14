import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import User from '@/models/User';
import Admin from '@/models/Admin';

export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context for multi-tenant support
    const tenantContext = await getTenantContext();
    const contextTenantId = session.tenantId || tenantContext.tenantId;
    
    // Get user with email, role, and tenantId
    const user = await User.findById(session.userId)
      .select('email role adminProfile tenantId')
      .populate('role', 'name tenantId')
      .lean() as any;
    
    if (!user || !user.email) {
      return NextResponse.json({ 
        success: false, 
        isAdmin: false,
        error: 'User not found' 
      });
    }
    
    // Get user's tenantId (from user record or session)
    const userTenantId = user.tenantId?.toString() || session.tenantId || contextTenantId;
    
    // Ensure tenant matching: user's tenant must match the context tenant
    if (contextTenantId && userTenantId && userTenantId !== contextTenantId) {
      return NextResponse.json({ 
        success: false, 
        isAdmin: false,
        error: 'Tenant mismatch' 
      });
    }
    
    // Use the user's tenantId for all checks (or context tenantId if user doesn't have one)
    const tenantId = userTenantId || contextTenantId;
    
    // Check if user has admin role (tenant-scoped)
    let hasAdminRole = false;
    if (user.role) {
      const roleName = user.role?.name || (typeof user.role === 'string' ? user.role : null);
      const roleTenantId = user.role?.tenantId?.toString() || (typeof user.role === 'object' && user.role?.tenantId ? user.role.tenantId.toString() : null);
      
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
    const adminQuery: any = { 
      email: user.email.toLowerCase().trim(),
      status: 'active'
    };
    
    if (tenantId) {
      // Ensure admin profile belongs to the same tenant as the user
      adminQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      // If no tenant, check for admins without tenantId (backward compatibility)
      // But also ensure user doesn't have a tenantId
      if (!userTenantId) {
        adminQuery.$or = [
          { tenantId: { $exists: false } },
          { tenantId: null }
        ];
      } else {
        // User has tenantId but context doesn't - this shouldn't happen, but be safe
        return NextResponse.json({ 
          success: false, 
          isAdmin: false,
          error: 'Tenant context required' 
        });
      }
    }
    
    const adminProfile = await Admin.findOne(adminQuery).lean();
    
    // User is admin if they have admin role OR admin profile exists
    // Both must be in the same tenant as the user
    const isAdmin = hasAdminRole || !!adminProfile;
    
    return NextResponse.json({ 
      success: true, 
      isAdmin: isAdmin
    });
  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json(
      { success: false, isAdmin: false, error: 'Failed to check admin status' },
      { status: 500 }
    );
  }
}
