import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryAdjustClient from '@/components/InventoryAdjustClient';

export default async function InventoryAdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <InventoryAdjustClient itemId={id} />;
}

