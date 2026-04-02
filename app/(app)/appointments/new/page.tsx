import { requirePagePermission } from '@/app/lib/auth-helpers';
import AppointmentsPageClient from '@/components/AppointmentsPageClient';

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  await requirePagePermission('appointments', 'create');

  const params = await searchParams;
  return <AppointmentsPageClient patientId={params.patientId} />;
}
