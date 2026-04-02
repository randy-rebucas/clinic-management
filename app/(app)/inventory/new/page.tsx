import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryFormClient from '@/components/InventoryFormClient';

export default async function NewInventoryPage() {
  await requireAdmin();

  return <InventoryFormClient />;
}
