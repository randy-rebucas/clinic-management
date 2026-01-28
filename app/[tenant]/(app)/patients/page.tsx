import { requirePagePermission } from '@/app/lib/auth-helpers';
import PatientsPageClient from '@/components/PatientsPageClient';

export default async function PatientsPage() {
  // Require permission to read patients
  await requirePagePermission('patients', 'read');

  return <PatientsPageClient />;
}
