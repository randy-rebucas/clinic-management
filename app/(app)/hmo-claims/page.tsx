import { requirePagePermission } from '@/app/lib/auth-helpers';
import HmoClaimsClient from '@/components/hmo/HmoClaimsClient';

export const dynamic = 'force-dynamic';

/** Billing staff (invoices:write), as the HMO claims report allows. */
export default async function HmoClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePagePermission('invoices', 'write');
  const { tab } = await searchParams;
  return <HmoClaimsClient initialTab={tab === 'batches' || tab === 'hmos' ? tab : 'open'} />;
}
