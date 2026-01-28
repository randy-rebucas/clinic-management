import { requirePagePermission } from '@/app/lib/auth-helpers';
import PrescriptionsPageClient from '@/components/PrescriptionsPageClient';

export default async function PrescriptionsPage() {
  // Require permission to read prescriptions
  await requirePagePermission('prescriptions', 'read');

  return <PrescriptionsPageClient />;
}

