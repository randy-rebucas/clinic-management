import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryAdjustClient from '@/components/InventoryAdjustClient';

export default async function InventoryAdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  return <InventoryAdjustClient itemId={id} />;
}
