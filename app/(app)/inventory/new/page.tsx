import InventoryFormClient from '@/components/InventoryFormClient';
import { requireInventoryWriter } from '@/lib/inventory-page';

export default async function NewInventoryPage() {
  await requireInventoryWriter();
  return <InventoryFormClient />;
}
