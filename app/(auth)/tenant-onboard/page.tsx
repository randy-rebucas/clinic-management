import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { pageMetadata } from '@/lib/seo';
import TenantOnboardClient from '@/components/TenantOnboardClient';
import ClinicSignupUnavailable from '@/components/ClinicSignupUnavailable';
import { getTenantContext } from '@/lib/tenant';
import { mainSiteHost } from '@/lib/subdomain';

const signupMetadata: Metadata = {
  ...pageMetadata({
    title: 'Register Your Clinic — Start a Free Trial',
    path: '/tenant-onboard',
    description: "Start your free 14-day MyClinicSoft trial. Set up your clinic's name, contact details, and admin account in minutes — no credit card required.",
  }),
  // The (auth) group is noindex; clinic sign-up is the one page in it we want found.
  robots: { index: true, follow: true },
};

export async function generateMetadata(): Promise<Metadata> {
  const { subdomain } = await getTenantContext();
  return subdomain
    ? { title: 'Register a new clinic', robots: { index: false, follow: false } }
    : signupMetadata;
}

export default async function TenantOnboardPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  // A medical rep's signup link: /tenant-onboard?ref=REP-7K2PQX
  const { ref } = await searchParams;
  const code = typeof ref === 'string' ? ref.trim().slice(0, 40) : '';

  // New clinics register on the main site only, never on an existing clinic's subdomain.
  const { subdomain, tenant } = await getTenantContext();
  if (subdomain) {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || '';
    const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const mainSite = `${proto}://${mainSiteHost(host)}`;
    const onboardUrl = `${mainSite}/tenant-onboard${code ? `?ref=${encodeURIComponent(code)}` : ''}`;
    return (
      <ClinicSignupUnavailable
        clinicName={tenant ? tenant.displayName || tenant.name : null}
        subdomain={subdomain}
        onboardUrl={onboardUrl}
        mainSiteUrl={mainSite}
      />
    );
  }

  return <TenantOnboardClient initialReferralCode={code} />;
}
