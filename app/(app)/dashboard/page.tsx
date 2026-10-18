import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DashboardRouter from '@/components/DashboardRouter';

export default async function Dashboard() {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  // Medical representatives use the mobile app; the login page does not bounce them back here.
  if (session.role === 'medical-representative') {
    redirect('/login');
  }

  return <DashboardRouter role={session.role} />;
}
