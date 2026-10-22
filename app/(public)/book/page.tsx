import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { getRootDomain, getTenantContext } from '@/lib/tenant';
import PublicBookingClient from '@/components/PublicBookingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Book a Clinic Appointment Online',
  path: '/book',
  description: 'Book a clinic appointment online: choose your clinic and doctor, pick a schedule that works for you, and get a confirmation right away.',
});

export default async function PublicBookingPage() {
  const { subdomain, tenantId } = await getTenantContext();
  // A subdomain with no active clinic behind it: nothing to book.
  if (subdomain && !tenantId) notFound();
  return <PublicBookingClient subdomain={subdomain ?? ''} rootDomain={getRootDomain().split(':')[0]} />;
}
