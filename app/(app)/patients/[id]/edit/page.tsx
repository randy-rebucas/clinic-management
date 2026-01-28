import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import PatientEditClient from '@/components/PatientEditClient';

export default async function PatientEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  // Require permission to update patients
  await requirePagePermission('patients', 'update');

  const { id } = await params;
  return <PatientEditClient patientId={id} />;
}

