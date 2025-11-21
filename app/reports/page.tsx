import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import ReportsPageClient from '@/components/ReportsPageClient';

export default async function ReportsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <ReportsPageClient />;
}

