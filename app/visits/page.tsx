import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import VisitsPageClient from '@/components/VisitsPageClient';

export default async function VisitsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <VisitsPageClient />;
}

