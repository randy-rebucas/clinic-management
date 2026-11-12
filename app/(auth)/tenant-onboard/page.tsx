import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import TenantOnboardClient from '@/components/TenantOnboardClient';

export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Register Your Clinic — Start a Free Trial',
    path: '/tenant-onboard',
    description: "Start your free 14-day MyClinicSoft trial. Set up your clinic's name, contact details, and admin account in minutes — no credit card required.",
  }),
  // The (auth) group is noindex; clinic sign-up is the one page in it we want found.
  robots: { index: true, follow: true },
};

export default async function TenantOnboardPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  // A medical rep's signup link: /tenant-onboard?ref=REP-7K2PQX
  const { ref } = await searchParams;
  const code = typeof ref === 'string' ? ref.trim().slice(0, 40) : '';
  return <TenantOnboardClient initialReferralCode={code} />;
}

