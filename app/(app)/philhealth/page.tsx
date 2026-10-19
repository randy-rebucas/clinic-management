import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { getSettings } from '@/lib/settings';
import { philhealthSettingsOf } from '@/lib/philhealth';
import PhilhealthClient from '@/components/philhealth/PhilhealthClient';

export const dynamic = 'force-dynamic';

/** Billing staff (invoices:write). `?tab=filed|done|rates`. */
export default async function PhilhealthPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePagePermission('invoices', 'write');
  const session = await verifySession();
  if (!session) redirect('/login');
  const { tab } = await searchParams;
  const settings = philhealthSettingsOf((await getSettings(session.tenantId)).philhealthSettings);
  return (
    <PhilhealthClient
      initialTab={tab === 'filed' || tab === 'done' || tab === 'rates' ? tab : 'file'}
      configured={settings.enabled}
      filingDays={settings.filingDays}
    />
  );
}
