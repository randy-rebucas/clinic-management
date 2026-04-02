import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeVisitsClient from '@/components/MedicalRepresentativeVisitsClient';

export const metadata = {
  title: 'Track Visits | Medical Representative Portal',
  description: 'Track and manage your clinic visits and interactions',
};

export default async function MedicalRepresentativeVisitsPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeVisitsClient />;
}
