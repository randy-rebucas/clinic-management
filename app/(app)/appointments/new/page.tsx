import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import AppointmentsPageClient from '@/components/AppointmentsPageClient';

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  return <AppointmentsPageClient patientId={params.patientId} />;
}

