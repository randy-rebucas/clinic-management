import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DashboardRouter from '@/components/DashboardRouter';

export default async function Dashboard() {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'medical-representative') {
    redirect('/medical-representative/portal');
  }

  return <DashboardRouter role={session.role} />;
}
