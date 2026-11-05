import { Types } from 'mongoose';
import Tenant from '@/models/Tenant';
import { getTenantContext } from '@/lib/tenant';
import { isValidId } from '@/lib/api/tenant-session';

/**
 * Resolve the clinic for a public request. The subdomain wins; on the root domain the
 * booking page lets the visitor pick a clinic, so an explicit id is accepted only if it
 * names an active tenant.
 */
export async function resolvePublicTenant(explicitTenantId: unknown): Promise<Types.ObjectId | null> {
  const ctx = await getTenantContext();
  if (ctx.tenantId) return new Types.ObjectId(ctx.tenantId);
  if (!isValidId(explicitTenantId)) return null;
  const tenant = (await Tenant.findOne({ _id: explicitTenantId, status: 'active' }).select('_id').lean()) as any;
  return tenant ? (tenant._id as Types.ObjectId) : null;
}
