import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DoctorsPageClient from '@/components/DoctorsPageClient';

export default async function DoctorsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <DoctorsPageClient />;
}
