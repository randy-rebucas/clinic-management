import { requirePagePermission } from '@/app/lib/auth-helpers';
import HmoClaimsClient, { type HmoTab } from '@/components/hmo/HmoClaimsClient';
import { isBatchShow, isOwedAgingKey } from '@/lib/hmo';

export const dynamic = 'force-dynamic';

const ID = /^[a-f0-9]{24}$/i;

/**
 * Billing staff (invoices:write), as the HMO claims report allows. `?tab=batches|hmos`, and for
 * the transmittals `?show=`, `?hmo=`, `?aging=`, `?search=`.
 */
export default async function HmoClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string; hmo?: string; aging?: string; search?: string }>;
}) {
  await requirePagePermission('invoices', 'write');
  const sp = await searchParams;
  const show = isBatchShow(sp.show) ? sp.show : null;
  const hmo = sp.hmo && ID.test(sp.hmo) ? sp.hmo : null;
  const aging = isOwedAgingKey(sp.aging) ? sp.aging : null;
  const search = (sp.search ?? '').slice(0, 100);
  const filtered = Boolean(show || hmo || aging || search);
  const tab: HmoTab = sp.tab === 'batches' || sp.tab === 'hmos' ? sp.tab : filtered ? 'batches' : 'open';
  return <HmoClaimsClient initial={{ tab, show, hmo, aging, search }} />;
}
