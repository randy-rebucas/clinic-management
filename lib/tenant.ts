/**
 * Tenant context utilities for multi-tenant support
 *
 * DB-touching functions below use lib/data/tenant.ts (Prisma). Tenant is the
 * tenant-scoping ROOT (not in DIRECTLY_SCOPED_MODELS / JUNCTION_SCOPED_MODELS
 * in lib/prisma-tenant-extension.ts), so these calls don't strictly need
 * runWithTenant/runAsSystem for the extension's sake — they're wrapped in
 * runAsSystem() anyway for consistency, and because getTenantContext() is
 * frequently the FIRST call in a request path, so establishing an
 * AsyncLocalStorage context here (even a bypass one) is harmless and keeps
 * the pattern uniform for any future code added to this file.
 */
import 'server-only';

import { headers } from 'next/headers';
import { runAsSystem } from '@/lib/tenant-context';
import { getTenantBySubdomain } from '@/lib/data/tenant';

// Type for tenant data returned in context (with string _id)
export type TenantData = {
  _id: string;
  name: string;
  subdomain: string;
  displayName?: string;
  status: 'active' | 'inactive' | 'suspended';
  settings?: {
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  subscription?: {
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    expiresAt?: Date | string;
  };
};

export interface TenantContext {
  tenantId: string | null;
  subdomain: string | null;
  tenant: TenantData | null;
}

/**
 * Reconstruct the nested `settings`/`subscription` shape downstream callers
 * expect from Prisma's flattened Tenant columns (see
 * prisma/MIGRATION_NOTES.md — Tenant.settings-prefixed / subscription-prefixed
 * columns are flattened fixed-shape structs, not JSON columns).
 */
function toTenantData(tenant: {
  id: string;
  name: string;
  subdomain: string;
  displayName: string | null;
  status: string;
  settingsTimezone: string | null;
  settingsCurrency: string | null;
  settingsDateFormat: string | null;
  settingsLogo: string | null;
  settingsPrimaryColor: string | null;
  settingsSecondaryColor: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: Date | null;
}): TenantData {
  return {
    _id: tenant.id,
    name: tenant.name,
    subdomain: tenant.subdomain,
    displayName: tenant.displayName ?? undefined,
    status: tenant.status as TenantData['status'],
    settings: {
      timezone: tenant.settingsTimezone ?? undefined,
      currency: tenant.settingsCurrency ?? undefined,
      dateFormat: tenant.settingsDateFormat ?? undefined,
      logo: tenant.settingsLogo ?? undefined,
      primaryColor: tenant.settingsPrimaryColor ?? undefined,
      secondaryColor: tenant.settingsSecondaryColor ?? undefined,
    },
    subscription: tenant.subscriptionPlan || tenant.subscriptionStatus || tenant.subscriptionExpiresAt
      ? {
          plan: tenant.subscriptionPlan ?? undefined,
          status: (tenant.subscriptionStatus as 'active' | 'cancelled' | 'expired' | null) ?? undefined,
          expiresAt: tenant.subscriptionExpiresAt ?? undefined,
        }
      : undefined,
  };
}

/**
 * Extract subdomain from request headers
 */
export function extractSubdomain(host?: string | null): string | null {
  if (!host) return null;

  const hostname = host.split(':')[0]; // Remove port if present
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost';

  // Local development environment
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    // Try to extract subdomain from the full URL
    if (hostname.includes('.localhost')) {
      const parts = hostname.split('.');
      if (parts.length > 1 && parts[0] !== 'www') {
        return parts[0];
      }
    }
    return null;
  }

  // Production environment
  const rootDomainFormatted = rootDomain.split(':')[0];

  // Handle preview deployment URLs (tenant---branch-name.vercel.app)
  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts.length > 0 ? parts[0] : null;
  }

  // Regular subdomain detection
  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);

  return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, '') : null;
}

/**
 * Get tenant context from request headers
 * This is used in server components and API routes
 */
export async function getTenantContext(): Promise<TenantContext> {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || headersList.get('x-forwarded-host');
    const subdomain = extractSubdomain(host);

    if (!subdomain) {
      return {
        tenantId: null,
        subdomain: null,
        tenant: null,
      };
    }

    // Tenant is the scoping root, not itself tenant-scoped — wrap in
    // runAsSystem() for pattern consistency (see file header comment).
    const tenant = await runAsSystem(() => getTenantBySubdomain(subdomain.toLowerCase()));

    if (!tenant || tenant.status !== 'active') {
      return {
        tenantId: null,
        subdomain,
        tenant: null,
      };
    }

    return {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      tenant: toTenantData(tenant),
    };
  } catch (error) {
    console.error('Error getting tenant context:', error);
    return {
      tenantId: null,
      subdomain: null,
      tenant: null,
    };
  }
}

/**
 * Get tenant ID from request headers (lightweight version)
 */
export async function getTenantId(): Promise<string | null> {
  const context = await getTenantContext();
  return context.tenantId;
}

// NOTE: getTenantBySlug() was dropped in the Prisma cutover. It referenced a
// `slug` field that never existed on the Mongoose Tenant model (the real
// field is `subdomain`) — grepping the repo turned up no callers besides
// this file and a docs mention, so it was dead/broken code. If a `slug`
// lookup is needed in the future, add it against `getTenantBySubdomain` (or
// a real `slug` column) rather than resurrecting this stub.

/**
 * Verify that a tenant exists and is active
 */
export async function verifyTenant(subdomain: string): Promise<TenantData | null> {
  try {
    const tenant = await runAsSystem(() => getTenantBySubdomain(subdomain.toLowerCase()));

    if (!tenant || tenant.status !== 'active') {
      return null;
    }

    return toTenantData(tenant);
  } catch (error) {
    console.error('Error verifying tenant:', error);
    return null;
  }
}

/**
 * Get root domain from environment or default
 */
export function getRootDomain(): string {
  return process.env.ROOT_DOMAIN || 'localhost';
}
