import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeSettingsClient from '@/components/MedicalRepresentativeSettingsClient';

export const metadata = {
  title: 'Settings | Medical Representative Portal',
  description: 'Manage your medical representative account settings',
};

export default async function MedicalRepresentativeSettingsPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeSettingsClient />;
}
