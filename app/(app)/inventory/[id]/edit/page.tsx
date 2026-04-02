import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryEditClient from '@/components/InventoryEditClient';

export default async function InventoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  return <InventoryEditClient itemId={id} />;
}
