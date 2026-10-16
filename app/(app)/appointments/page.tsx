import AppointmentsPageClient from '@/components/AppointmentsPageClient';
import { loadAppointmentsPageContext } from '@/lib/appointments-page';

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string; doctor?: string }> }) {
  const { permissions, doctors } = await loadAppointmentsPageContext('read');
  const { date, doctor } = await searchParams;
  return (
    <AppointmentsPageClient
      permissions={permissions}
      doctors={doctors}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
      initialDoctor={doctor && doctors.some((d) => d._id === doctor) ? doctor : undefined}
    />
  );
}
