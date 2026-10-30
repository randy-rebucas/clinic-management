import 'server-only';
import { Types } from 'mongoose';
import Tenant from '@/models/Tenant';

/** Clinic display names by tenant id, for the records a patient list returns. */
export async function clinicNames(tenantIds: unknown[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(tenantIds.filter(Boolean).map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (!ids.length) return new Map();
  const tenants = await Tenant.find({ _id: { $in: ids } })
    .select('name displayName')
    .lean<{ _id: unknown; name?: string; displayName?: string }[]>();
  return new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || null]));
}
