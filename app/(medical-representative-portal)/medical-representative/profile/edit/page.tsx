import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeProfileEditClient from '@/components/MedicalRepresentativeProfileEditClient';

export const metadata = {
  title: 'Edit Profile | Medical Representative Portal',
  description: 'Edit your medical representative profile information',
};

export default async function MedicalRepresentativeProfileEditPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeProfileEditClient />;
}
