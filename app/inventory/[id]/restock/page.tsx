import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryRestockClient from '@/components/InventoryRestockClient';

export default async function InventoryRestockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <InventoryRestockClient itemId={id} />;
}

