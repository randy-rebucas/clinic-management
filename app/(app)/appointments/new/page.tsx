import AppointmentsPageClient from '@/components/AppointmentsPageClient';
import { loadAppointmentsPageContext } from '@/lib/appointments-page';

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; doctorId?: string }>;
}) {
  // Booking is `appointments:write`, the same permission POST /api/appointments checks.
  const { permissions, doctors } = await loadAppointmentsPageContext('write');
  const params = await searchParams;
  const doctorId = params.doctorId && doctors.some((d) => d._id === params.doctorId) ? params.doctorId : undefined;
  return <AppointmentsPageClient permissions={permissions} doctors={doctors} openBooking patientId={params.patientId} bookingDoctor={doctorId} />;
}
