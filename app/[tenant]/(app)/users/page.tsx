import { requireAdmin } from '@/app/lib/auth-helpers';
import UserRoleManagementClient from '@/components/UserRoleManagementClient';

export default async function UserRoleManagementPage() {
  // Require admin access
  await requireAdmin();

  return <UserRoleManagementClient />;
}

