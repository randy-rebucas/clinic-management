import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MedicalRepresentativeSupportClient from '@/components/MedicalRepresentativeSupportClient';

export const metadata = {
  title: 'Help & Support | Medical Representative Portal',
  description: 'Get help and support for your medical representative account',
};

export default async function MedicalRepresentativeSupportPage() {
  const session = await verifySession();
  if (!session || session.role !== 'medical-representative') {
    redirect('/medical-representatives/login');
  }
  return <MedicalRepresentativeSupportClient />;
}
