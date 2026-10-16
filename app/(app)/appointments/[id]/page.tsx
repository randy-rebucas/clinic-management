import AppointmentDetailClient from '@/components/appointments/AppointmentDetailClient';
import { loadAppointmentsPageContext } from '@/lib/appointments-page';

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissions } = await loadAppointmentsPageContext('read');
  const { id } = await params;
  return <AppointmentDetailClient id={id} permissions={permissions} />;
}
