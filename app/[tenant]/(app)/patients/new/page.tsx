import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import PatientNewClient from '@/components/PatientNewClient';

export default async function NewPatientPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  // Require permission to create patients
  await requirePagePermission('patients', 'write');

  return <PatientNewClient />;
}

