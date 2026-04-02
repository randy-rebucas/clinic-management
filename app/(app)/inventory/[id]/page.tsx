import { requireAdmin } from '@/app/lib/auth-helpers';
import InventoryDetailClient from '@/components/InventoryDetailClient';

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  return <InventoryDetailClient itemId={id} />;
}
