import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import LabResultsPageClient from '@/components/LabResultsPageClient';

export default async function LabResultsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <LabResultsPageClient />;
}

