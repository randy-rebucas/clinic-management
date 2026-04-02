import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryRestockClient from '@/components/InventoryRestockClient';

export default async function InventoryRestockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  return <InventoryRestockClient itemId={id} />;
}
