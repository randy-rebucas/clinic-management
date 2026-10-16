import InventoryPageClient from '@/components/InventoryPageClient';
import { loadInventoryPermissions } from '@/lib/inventory-page';
import { STOCK_STATUSES, isExpiryKey } from '@/lib/inventory';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; expiry?: string; search?: string }>;
}) {
  const permissions = await loadInventoryPermissions();
  const params = await searchParams;
  // Alerts and dashboards can link here with a filter chosen (e.g. ?status=reorder).
  const status = params.status === 'reorder' || (STOCK_STATUSES as string[]).includes(params.status ?? '') ? params.status! : '';

  return (
    <InventoryPageClient
      {...permissions}
      initialStatus={status}
      initialExpiry={isExpiryKey(params.expiry) ? params.expiry : null}
      initialSearch={(params.search ?? '').slice(0, 100)}
    />
  );
}
