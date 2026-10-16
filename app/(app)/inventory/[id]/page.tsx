import InventoryDetailClient from '@/components/InventoryDetailClient';
import { loadInventoryPermissions } from '@/lib/inventory-page';

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const permissions = await loadInventoryPermissions();
  const { id } = await params;
  const { saved } = await searchParams;
  return <InventoryDetailClient itemId={id} permissions={permissions} saved={saved === 'created' || saved === 'edited' ? saved : null} />;
}
