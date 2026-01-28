import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InventoryFormClient from '@/components/InventoryFormClient';

export default async function NewInventoryPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <InventoryFormClient />;
}

