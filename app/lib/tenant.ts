import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { verifySession } from './dal';

/**
 * Get the current tenant ID from headers (set by middleware)
 */
export async function getTenantId(): Promise<string | null> {
  try {
    const headersList = await headers();
    const tenantId = headersList.get('x-tenant-id');
    return tenantId;
  } catch (error) {
    console.error('Error getting tenant ID from headers:', error);
    return null;
  }
}

/**
 * Get the current tenant slug from headers (set by middleware)
 */
export async function getTenantSlug(): Promise<string | null> {
  try {
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    return tenantSlug;
  } catch (error) {
    console.error('Error getting tenant slug from headers:', error);
    return null;
  }
}

/**
 * Get the current tenant from headers or session
 */
export async function getTenant(): Promise<{ _id: string; slug: string; name: string } | null> {
  try {
    // First try to get from headers (set by middleware)
    const headersList = await headers();
    const tenantId = headersList.get('x-tenant-id');
    const tenantSlug = headersList.get('x-tenant-slug');
    const tenantName = headersList.get('x-tenant-name');

    if (tenantId && tenantSlug && tenantName) {
      return {
        _id: tenantId,
        slug: tenantSlug,
        name: tenantName,
      };
    }

    // Fallback: Get from session
    const session = await verifySession();
    if (session?.tenantId) {
      await connectDB();
      const tenant = await Tenant.findById(session.tenantId).lean();
      if (tenant) {
        return {
          _id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
        };
      }
    }

    // Fallback: Get from cookie
    const cookieStore = await cookies();
    const slugFromCookie = cookieStore.get('tenant-slug')?.value;
    if (slugFromCookie) {
      await connectDB();
      const tenant = await Tenant.findOne({ slug: slugFromCookie, status: 'active' }).lean();
      if (tenant) {
        return {
          _id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting tenant:', error);
    return null;
  }
}

/**
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string): Promise<{ _id: string; slug: string; name: string } | null> {
  try {
    await connectDB();
    const tenant = await Tenant.findOne({ slug, status: 'active' }).lean();
    if (!tenant) return null;
    
    return {
      _id: tenant._id.toString(),
      slug: tenant.slug,
      name: tenant.name,
    };
  } catch (error) {
    console.error('Error getting tenant by slug:', error);
    return null;
  }
}

/**
 * Verify that the current user belongs to the current tenant
 */
export async function verifyTenantAccess(userTenantId: string): Promise<boolean> {
  try {
    const currentTenant = await getTenant();
    if (!currentTenant) return false;
    
    return currentTenant._id === userTenantId;
  } catch (error) {
    console.error('Error verifying tenant access:', error);
    return false;
  }
}

