import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { isSetupComplete } from '@/lib/setup';
import DashboardClient from '@/components/DashboardClient';

export default async function Dashboard() {
  // Check if setup is complete first
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect('/setup');
  }

  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <DashboardClient />;
}
