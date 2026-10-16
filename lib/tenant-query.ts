/**
 * Tenant-scoped query utilities
 * Helper functions to automatically add tenantId to database queries
 */

import { getTenantId } from './tenant';
import { Types } from 'mongoose';

export class MissingTenantError extends Error {
  constructor() {
    super('Tenant context is required for this query');
    this.name = 'MissingTenantError';
  }
}

/**
 * Add the current tenant to a query. The tenant always overrides any tenantId in the query,
 * and there is no tenant-less fallback: without a tenant the query is refused.
 */
export async function addTenantFilter(query: any = {}): Promise<any> {
  const tenantId = await getTenantId();
  return createTenantQuery(tenantId, query);
}

/**
 * Create a tenant-scoped query for a specific tenant
 */
export function createTenantQuery(tenantId: string | null, baseQuery: any = {}): any {
  if (!tenantId) throw new MissingTenantError();
  return {
    ...baseQuery,
    tenantId: new Types.ObjectId(tenantId),
  };
}

/**
 * Ensure a document has tenantId set before saving
 * Use this in pre-save hooks or before creating documents
 */
export async function ensureTenantId(data: any): Promise<any> {
  const tenantId = await getTenantId();
  if (!tenantId) throw new MissingTenantError();
  return {
    ...data,
    tenantId: new Types.ObjectId(tenantId),
  };
}
