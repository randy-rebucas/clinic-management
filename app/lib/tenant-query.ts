import { getTenantId } from './tenant';
import { Types } from 'mongoose';

/**
 * Helper function to add tenant filter to Mongoose queries
 * This ensures all queries are automatically scoped to the current tenant
 */
export async function withTenant<T extends { tenantId?: Types.ObjectId | string }>(
  query: any,
  tenantId?: string | null
): Promise<any> {
  const currentTenantId = tenantId || await getTenantId();
  
  if (!currentTenantId) {
    throw new Error('Tenant ID is required. Please ensure you are accessing the application through a valid tenant.');
  }
  
  return query.where('tenantId').equals(new Types.ObjectId(currentTenantId));
}

/**
 * Helper function to create a tenant filter object
 */
export async function getTenantFilter(tenantId?: string | null): Promise<{ tenantId: Types.ObjectId }> {
  const currentTenantId = tenantId || await getTenantId();
  
  if (!currentTenantId) {
    throw new Error('Tenant ID is required. Please ensure you are accessing the application through a valid tenant.');
  }
  
  return { tenantId: new Types.ObjectId(currentTenantId) };
}

/**
 * Helper function to ensure a document belongs to the current tenant
 */
export async function ensureTenantAccess(
  document: { tenantId?: Types.ObjectId | string } | null,
  tenantId?: string | null
): Promise<boolean> {
  if (!document) return false;
  
  const currentTenantId = tenantId || await getTenantId();
  if (!currentTenantId) return false;
  
  const docTenantId = document.tenantId?.toString();
  return docTenantId === currentTenantId;
}

/**
 * Helper function to add tenantId to a new document before saving
 */
export async function addTenantToDocument<T extends { tenantId?: Types.ObjectId | string }>(
  doc: T,
  tenantId?: string | null
): Promise<T> {
  const currentTenantId = tenantId || await getTenantId();
  
  if (!currentTenantId) {
    throw new Error('Tenant ID is required. Please ensure you are accessing the application through a valid tenant.');
  }
  
  doc.tenantId = new Types.ObjectId(currentTenantId) as any;
  return doc;
}

