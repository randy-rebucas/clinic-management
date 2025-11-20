import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import PrescriptionsPageClient from '@/components/PrescriptionsPageClient';

export default async function PrescriptionsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <PrescriptionsPageClient />;
}

