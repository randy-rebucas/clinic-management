import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyPatientSession } from '@/app/lib/dal';
import PatientPortalClient from '@/components/PatientPortalClient';

export default async function PatientPortalPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('patient_session');
  const session = await verifyPatientSession(sessionCookie?.value);
  if (!session) {
    redirect('/patient/login');
  }
  return <PatientPortalClient />;
}

