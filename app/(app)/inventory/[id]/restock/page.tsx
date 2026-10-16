import InventoryDetailClient from '@/components/InventoryDetailClient';
import { requireInventoryWriter } from '@/lib/inventory-page';

/** Restocking is a dialog on the item's page; this address (used by stock alerts) opens it there. */
export default async function InventoryRestockPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await requireInventoryWriter();
  const { id } = await params;
  return <InventoryDetailClient itemId={id} permissions={permissions} openDialog="restock" />;
}
