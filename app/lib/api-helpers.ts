import { NextRequest, NextResponse } from 'next/server';
import { getTenantFilter } from './tenant-query';
import { verifySession } from './dal';
import { unauthorizedResponse } from './auth-helpers';

/**
 * Helper function to wrap API route handlers with automatic tenant filtering
 * This ensures all queries are automatically scoped to the current tenant
 */
export async function withTenantFilter<T extends Record<string, any>>(
  query: T,
  tenantId?: string | null
): Promise<T & { tenantId: any }> {
  const filter = await getTenantFilter(tenantId);
  return { ...query, ...filter };
}

/**
 * Helper function to get tenant-scoped query from request
 * Use this in API routes to automatically add tenant filtering
 */
export async function getTenantScopedQuery(request: NextRequest): Promise<{ tenantId: any }> {
  return await getTenantFilter();
}

/**
 * Helper function to ensure user session and tenant are valid
 * Returns the session and tenant filter, or an error response
 */
export async function requireAuthAndTenant(): Promise<
  | { session: any; tenantFilter: { tenantId: any }; error?: never }
  | { session?: never; tenantFilter?: never; error: NextResponse }
> {
  const session = await verifySession();
  
  if (!session) {
    return { error: unauthorizedResponse() };
  }

  try {
    const tenantFilter = await getTenantFilter();
    return { session, tenantFilter };
  } catch (error: any) {
    return {
      error: NextResponse.json(
        { success: false, error: error.message || 'Tenant not found' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Helper to add tenantId to a document before saving
 */
export async function addTenantToNewDocument<T extends Record<string, any>>(
  doc: T
): Promise<T & { tenantId: any }> {
  const filter = await getTenantFilter();
  return { ...doc, tenantId: filter.tenantId };
}

