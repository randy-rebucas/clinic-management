import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeDashboardClient from '@/components/MedicalRepresentativeDashboardClient';

export const metadata = {
  title: 'Dashboard | Medical Representative Portal',
  description: 'Medical representative dashboard and profile management',
};

export default async function MedicalRepresentativePortalPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeDashboardClient />;
}
