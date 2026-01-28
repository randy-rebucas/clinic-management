import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryPageClient from '@/components/InventoryPageClient';

export default async function InventoryPage() {
  // Require admin role for inventory access
  await requireAdmin();

  return <InventoryPageClient />;
}

