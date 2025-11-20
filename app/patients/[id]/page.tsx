import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import PatientDetailClient from '@/components/PatientDetailClient';

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <PatientDetailClient patientId={id} />;
}

