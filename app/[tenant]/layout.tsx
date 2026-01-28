import { ReactNode } from 'react';
import { getTenantBySlug } from '@/lib/tenant';
import { notFound, redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { verifyToken } from '@/app/lib/auth-helpers';
import { cookies, headers } from 'next/headers';

export async function generateStaticParams() {
  // For static generation, you can return common tenants
  // In production, you might want to fetch from database
  return [
    { tenant: 'default' },
  ];
}

async function ensureDefaultTenant() {
  await connectDB();
  const existing = await Tenant.findOne({ slug: 'default' });

  if (!existing) {
    try {
      await Tenant.create({
        slug: 'default',
        name: 'Default Store',
        settings: {
          currency: 'USD',
          timezone: 'UTC',
          language: 'en',
          primaryColor: '#2563eb',
        },
        isActive: true,
      });
    } catch (error: any) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }
}

type TenantLayoutProps = {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
};

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const { tenant: tenantSlug } = await params;

  const headersList = await headers();
  const referer = headersList.get('referer') || '';
  const isForbiddenRoute = referer.includes('/forbidden');

  if (tenantSlug === 'default') {
    await ensureDefaultTenant();
  }

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  await connectDB();
  const requestedTenant = await Tenant.findById(tenant._id)
    .select('_id slug domain subdomain')
    .lean();
  if (!requestedTenant) notFound();

  if (!isForbiddenRoute) {
    try {
      const cookieStore = await cookies();
      const authToken = cookieStore.get('auth-token');
      const host = headersList.get('host') || '';

      if (authToken?.value) {
        const payload = await verifyToken(authToken.value);

        if (payload && payload.tenantId) {
          const userTenant = await Tenant.findById(payload.tenantId)
            .select('_id slug domain subdomain')
            .lean();

          if (userTenant && !Array.isArray(userTenant)) {
            const userTenantId = String(userTenant._id);
            const requestedTenantId = String(userTenant._id);

            if (userTenantId !== requestedTenantId) {
              redirect(`/${tenantSlug}/forbidden`);
            }

            if (host && (userTenant.subdomain || userTenant.domain)) {
              const hostLower = host.toLowerCase();
              const isSubdomainMatch =
                userTenant.subdomain &&
                hostLower === (userTenant.subdomain.toLowerCase() + '.');
              const isDomainMatch =
                userTenant.domain &&
                hostLower === userTenant.domain.toLowerCase();

              if (!isSubdomainMatch && !isDomainMatch) {
                redirect(`/${tenantSlug}/forbidden`);
              }
            }
          }
        }
      }
    } catch {
      // Silently continue on auth errors
    }
  }

  return <>{children}</>;
}
