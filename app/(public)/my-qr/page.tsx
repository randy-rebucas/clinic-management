import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NO_INDEX } from '@/lib/seo';
import { getTenantContext } from '@/lib/tenant';
import SelfServeQrClient from '@/components/SelfServeQrClient';

/**
 * Self-serve app sign-in QR (or invite slip) for patients and parents, without the front desk:
 * SMS code to the number on file, then questions about the record. On a clinic subdomain the
 * lookup is limited to that clinic.
 */
export const metadata: Metadata = { title: 'Get your eMCR sign-in QR', robots: NO_INDEX };

export default async function MyQrPage() {
  const { subdomain, tenantId, tenant } = await getTenantContext();
  if (subdomain && !tenantId) notFound();
  return (
    <section className="px-4">
      <SelfServeQrClient tenantId={tenantId} clinicName={tenant?.displayName || tenant?.name || null} />
    </section>
  );
}
