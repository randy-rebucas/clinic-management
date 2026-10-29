import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NO_INDEX } from '@/lib/seo';
import { getTenantContext } from '@/lib/tenant';
import SelfServeQrClient from '@/components/SelfServeQrClient';

/**
 * The self-serve QR page for a tablet at the clinic (<clinic>.<domain>/kiosk/qr): full screen,
 * this clinic's patients only, and it resets itself after a minute without a touch.
 */
export const metadata: Metadata = { title: 'Get your eMCR sign-in QR', robots: NO_INDEX };

export default async function KioskQrPage() {
  const { tenantId, tenant } = await getTenantContext();
  if (!tenantId) notFound();
  return (
    <main className="flex min-h-dvh items-start justify-center bg-gray-50 px-4 sm:items-center">
      <SelfServeQrClient kiosk tenantId={tenantId} clinicName={tenant?.displayName || tenant?.name || null} />
    </main>
  );
}
