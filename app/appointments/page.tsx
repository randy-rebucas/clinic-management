import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import AppointmentsPageClient from '@/components/AppointmentsPageClient';

export default async function AppointmentsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <AppointmentsPageClient />;
}
