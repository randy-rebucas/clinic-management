import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { getTenantContext } from '@/lib/tenant';
import PublicOnboardingClient from '@/components/PublicOnboardingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Patient Registration',
  path: '/onboard',
  description: 'Register as a patient online in a few minutes and get your patient code for faster check-in at your clinic.',
});

export default async function PublicOnboardingPage() {
  const { subdomain, tenantId } = await getTenantContext();
  // A subdomain with no active clinic behind it: nothing to register with.
  if (subdomain && !tenantId) notFound();
  return <PublicOnboardingClient subdomain={subdomain ?? ''} />;
}

