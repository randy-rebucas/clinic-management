import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryEditClient from '@/components/InventoryEditClient';

export default async function InventoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <InventoryEditClient itemId={id} />;
}

