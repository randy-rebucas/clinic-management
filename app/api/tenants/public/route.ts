import { NextRequest, NextResponse } from 'next/server';
import { runAsSystem } from '@/lib/tenant-context';
import { getTenantBySubdomain, listTenants } from '@/lib/data/tenant';

/**
 * Get list of active tenants/clinics for public selection
 * Also supports querying by subdomain to get a specific tenant
 *
 * Cross-tenant public lookup — wrapped in runAsSystem() per the tenant
 * branch policy (Tenant is the scoping root and this route is inherently
 * not scoped to a single tenant).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain');

    // If subdomain is provided, return that specific tenant
    // Note: 'www' is not a valid subdomain - treat it as root domain
    if (subdomain && subdomain.toLowerCase() !== 'www') {
      const tenant = await runAsSystem(() => getTenantBySubdomain(subdomain.toLowerCase()));

      if (!tenant || tenant.status !== 'active') {
        return NextResponse.json(
          {
            success: false,
            message: 'Clinic not found',
            tenant: null,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        tenant: {
          _id: tenant.id,
          name: tenant.name,
          displayName: tenant.displayName || tenant.name,
          subdomain: tenant.subdomain,
          email: tenant.email,
          phone: tenant.phone,
          address: {
            street: tenant.addressStreet,
            city: tenant.addressCity,
            state: tenant.addressState,
            zipCode: tenant.addressZipCode,
            country: tenant.addressCountry,
          },
        },
      });
    }

    // If subdomain is 'www' or empty, treat as root domain and return all tenants

    // Get all active tenants
    const tenants = await runAsSystem(() => listTenants({ status: 'active' }));

    return NextResponse.json({
      success: true,
      tenants: tenants
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((tenant) => ({
          _id: tenant.id,
          name: tenant.name,
          displayName: tenant.displayName || tenant.name,
          subdomain: tenant.subdomain,
          email: tenant.email,
          phone: tenant.phone,
          address: {
            street: tenant.addressStreet,
            city: tenant.addressCity,
            state: tenant.addressState,
            zipCode: tenant.addressZipCode,
            country: tenant.addressCountry,
          },
        })),
    });
  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch clinics',
        tenants: [],
      },
      { status: 500 }
    );
  }
}
