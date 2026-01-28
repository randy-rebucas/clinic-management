import { requireAdmin } from '@/app/lib/auth-helpers';
import RolesManagementClient from '@/components/RolesManagementClient';

export default async function RolesManagementPage() {
  // Require admin access - this will redirect to dashboard if not admin
  await requireAdmin();

  return <RolesManagementClient />;
}

