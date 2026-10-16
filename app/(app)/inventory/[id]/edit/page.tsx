import InventoryEditClient from '@/components/InventoryEditClient';
import { requireInventoryWriter } from '@/lib/inventory-page';

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventoryWriter();
  const { id } = await params;
  return <InventoryEditClient itemId={id} />;
}
