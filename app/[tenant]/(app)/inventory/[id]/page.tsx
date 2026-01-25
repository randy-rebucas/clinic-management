import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryDetailClient from '@/components/InventoryDetailClient';

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <InventoryDetailClient itemId={id} />;
}



