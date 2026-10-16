import InventoryDetailClient from '@/components/InventoryDetailClient';
import { requireInventoryWriter } from '@/lib/inventory-page';

/** Adjusting is a dialog on the item's page; this address opens it there. */
export default async function InventoryAdjustPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await requireInventoryWriter();
  const { id } = await params;
  return <InventoryDetailClient itemId={id} permissions={permissions} openDialog="adjust" />;
}
