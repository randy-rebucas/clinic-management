import { Types } from 'mongoose';
import Tenant from '@/models/Tenant';
import { resolveTimezone } from '@/lib/tz';

/** The clinic's IANA timezone (Tenant.settings.timezone), falling back to the default. */
export async function getTenantTimezone(tenantId: string | Types.ObjectId | null | undefined): Promise<string> {
  if (!tenantId || !Types.ObjectId.isValid(String(tenantId))) return resolveTimezone(null);
  try {
    const tenant = await Tenant.findById(tenantId).select('settings.timezone').lean() as any;
    return resolveTimezone(tenant?.settings?.timezone);
  } catch {
    return resolveTimezone(null);
  }
}
