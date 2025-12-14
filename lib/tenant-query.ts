/**
 * Tenant-scoped query utilities
 * Helper functions to automatically add tenantId to database queries
 */

import { getTenantId } from './tenant';
import { Types } from 'mongoose';

/**
 * Add tenant filter to a query object
 * This ensures all queries are scoped to the current tenant
 */
export async function addTenantFilter(query: any = {}): Promise<any> {
  const tenantId = await getTenantId();
  
  if (tenantId) {
    return {
      ...query,
      tenantId: new Types.ObjectId(tenantId),
    };
  }
  
  // If no tenant, return query for null tenantId (backward compatibility)
  // Wrap existing $or if it exists
  if (query.$or) {
    return {
      ...query,
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null },
        ...query.$or,
      ],
    };
  }
  
  return {
    ...query,
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
    ],
  };
}

/**
 * Create a tenant-scoped query for a specific tenant
 */
export function createTenantQuery(tenantId: string | null, baseQuery: any = {}): any {
  if (tenantId) {
    return {
      ...baseQuery,
      tenantId: new Types.ObjectId(tenantId),
    };
  }
  
  // If no tenant, return query for null tenantId (backward compatibility)
  if (baseQuery.$or) {
    return {
      ...baseQuery,
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null },
        ...baseQuery.$or,
      ],
    };
  }
  
  return {
    ...baseQuery,
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
    ],
  };
}

/**
 * Ensure a document has tenantId set before saving
 * Use this in pre-save hooks or before creating documents
 */
export async function ensureTenantId(data: any): Promise<any> {
  const tenantId = await getTenantId();
  
  if (tenantId && !data.tenantId) {
    return {
      ...data,
      tenantId: new Types.ObjectId(tenantId),
    };
  }
  
  return data;
}

