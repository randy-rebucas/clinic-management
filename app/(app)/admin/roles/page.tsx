import { requireAdmin } from '@/app/lib/auth-helpers';
import RolesManagementClient from '@/components/RolesManagementClient';

export default async function RolesManagementPage() {
  // Require admin access
  await requireAdmin();

  return <RolesManagementClient />;
}

