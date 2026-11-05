import { Types } from 'mongoose';
import Tenant from '@/models/Tenant';
import { resolveTimezone } from '@/lib/tz';

// Per instance, like the settings cache and as short, since other instances can't be cleared.
const zones = new Map<string, { zone: string; at: number }>();
const CACHE_MS = 60 * 1000;
const CACHE_MAX = 1000;

/** The clinic's IANA timezone (Tenant.settings.timezone), falling back to the default. */
export async function getTenantTimezone(tenantId: string | Types.ObjectId | null | undefined): Promise<string> {
  if (!tenantId || !Types.ObjectId.isValid(String(tenantId))) return resolveTimezone(null);
  const key = String(tenantId);
  const hit = zones.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.zone;
  try {
    const tenant = await Tenant.findById(tenantId).select('settings.timezone').lean() as any;
    const zone = resolveTimezone(tenant?.settings?.timezone);
    if (zones.size >= CACHE_MAX) zones.clear();
    zones.set(key, { zone, at: Date.now() });
    return zone;
  } catch {
    return resolveTimezone(null);
  }
}

/** Call after changing a clinic's timezone. */
export function clearTimezoneCache(tenantId: string | Types.ObjectId) {
  zones.delete(String(tenantId));
}
