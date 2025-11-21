import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryPageClient from '@/components/InventoryPageClient';

export default async function InventoryPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <InventoryPageClient />;
}

