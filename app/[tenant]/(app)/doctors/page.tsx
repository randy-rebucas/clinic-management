import { requirePagePermission } from '@/app/lib/auth-helpers';
import DoctorsPageClient from '@/components/DoctorsPageClient';

export default async function DoctorsPage() {
  // Require permission to read doctors
  await requirePagePermission('doctors', 'read');

  return <DoctorsPageClient />;
}
