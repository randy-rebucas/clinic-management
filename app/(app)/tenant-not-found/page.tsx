import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/tenant';
import TenantNotFound from '@/components/TenantNotFound';

export default async function TenantNotFoundPage() {
  const headersList = await headers();
  const host = headersList.get('host') || headersList.get('x-forwarded-host');
  const subdomain = extractSubdomain(host);

  return <TenantNotFound subdomain={subdomain} />;
}

