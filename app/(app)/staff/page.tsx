import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import StaffManagementClient from '@/components/StaffManagementClient';

export default async function StaffManagementPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Only admins can access staff management
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <StaffManagementClient user={safeUser} />;
}

