import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { getRootDomain, getTenantContext } from '@/lib/tenant';
import PublicBookingClient from '@/components/PublicBookingClient';
import { clinicPageUrl } from '@/lib/clinic-website';

const marketingMetadata: Metadata = pageMetadata({
  title: 'Book a Clinic Appointment Online',
  path: '/book',
  description: 'Book a clinic appointment online: choose your clinic and doctor, pick a schedule that works for you, and get a confirmation right away.',
});

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await getTenantContext();
  if (!tenant) return marketingMetadata;
  const name = tenant.displayName || tenant.name;
  const description = `Book an appointment at ${name} online: pick your doctor and a schedule that works for you.`;
  const url = await clinicPageUrl('/book');
  return {
    title: 'Book an appointment',
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: name, locale: 'en_PH', url, title: `Book an appointment | ${name}`, description },
    twitter: { card: 'summary', title: `Book an appointment | ${name}`, description },
  };
}

export default async function PublicBookingPage() {
  const { subdomain, tenantId } = await getTenantContext();
  // A subdomain with no active clinic behind it: nothing to book.
  if (subdomain && !tenantId) notFound();
  return <PublicBookingClient subdomain={subdomain ?? ''} rootDomain={getRootDomain().split(':')[0]} />;
}
