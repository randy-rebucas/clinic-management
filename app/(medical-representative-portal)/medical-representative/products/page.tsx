import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeProductsClient from '@/components/MedicalRepresentativeProductsClient';

export const metadata = {
  title: 'Products Portfolio | Medical Representative Portal',
  description: 'Manage your pharmaceutical products portfolio',
};

export default async function MedicalRepresentativeProductsPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeProductsClient />;
}
