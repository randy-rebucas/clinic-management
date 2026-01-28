import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import PrescriptionDetailClient from '@/components/PrescriptionDetailClient';

export default async function PrescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <PrescriptionDetailClient prescriptionId={id} />;
}

