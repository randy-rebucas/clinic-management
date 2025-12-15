/**
 * Tenant context utilities for multi-tenant support
 */

import { headers } from 'next/headers';
import connectDB from '@/lib/mongodb';
import Tenant, { ITenant } from '@/models/Tenant';
import { Types } from 'mongoose';

// Type for lean tenant result from database
type TenantLean = {
  _id: Types.ObjectId;
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
    expiresAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
};

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
    hostname !== `clinic-management-alpha.${rootDomainFormatted}` &&
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

    await connectDB();
    const tenant = await Tenant.findOne({ 
      subdomain: subdomain.toLowerCase(),
      status: 'active'
    }).select('_id name subdomain displayName status settings subscription').lean() as TenantLean | null;

    if (!tenant) {
      return {
        tenantId: null,
        subdomain,
        tenant: null,
      };
    }

    return {
      tenantId: tenant._id.toString(),
      subdomain: tenant.subdomain,
      tenant: {
        _id: tenant._id.toString(),
        name: tenant.name,
        subdomain: tenant.subdomain,
        displayName: tenant.displayName,
        status: tenant.status,
        settings: tenant.settings,
        subscription: tenant.subscription ? {
          plan: tenant.subscription.plan,
          status: tenant.subscription.status,
          expiresAt: tenant.subscription.expiresAt,
        } : undefined,
      },
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

/**
 * Verify that a tenant exists and is active
 */
export async function verifyTenant(subdomain: string): Promise<TenantData | null> {
  try {
    await connectDB();
    const tenant = await Tenant.findOne({ 
      subdomain: subdomain.toLowerCase(),
      status: 'active'
    }).select('_id name subdomain displayName status settings subscription').lean() as TenantLean | null;

    if (!tenant) {
      return null;
    }

    return {
      _id: tenant._id.toString(),
      name: tenant.name,
      subdomain: tenant.subdomain,
      displayName: tenant.displayName,
      status: tenant.status,
      settings: tenant.settings,
      subscription: tenant.subscription ? {
        plan: tenant.subscription.plan,
        status: tenant.subscription.status,
        expiresAt: tenant.subscription.expiresAt,
      } : undefined,
    };
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

