import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import RoomsManagementClient from '@/components/RoomsManagementClient';

export default async function RoomsManagementPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Only admins can access rooms management
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <RoomsManagementClient user={safeUser} />;
}

