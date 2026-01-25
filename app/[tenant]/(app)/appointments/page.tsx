import { requirePagePermission } from '@/app/lib/auth-helpers';
import AppointmentsPageClient from '@/components/AppointmentsPageClient';

export default async function AppointmentsPage() {
  // Require permission to read appointments
  await requirePagePermission('appointments', 'read');

  return <AppointmentsPageClient />;
}
