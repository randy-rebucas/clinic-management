import { requireAdmin } from '@/app/lib/auth-helpers';
import MedicalRepsManagementClient from '@/components/MedicalRepsManagementClient';

export const metadata = {
  title: 'Medical Representatives | MyClinicSoft',
  description: 'Manage medical representatives',
};

export default async function MedicalRepsPage() {
  // Require admin access
  await requireAdmin();

  return <MedicalRepsManagementClient />;
}

