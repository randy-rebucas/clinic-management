import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import PatientsPageClient from '@/components/PatientsPageClient';

export default async function PatientsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <PatientsPageClient />;
}
