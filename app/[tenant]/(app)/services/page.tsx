import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import ServicesManagementClient from '@/components/ServicesManagementClient';

export default async function ServicesManagementPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Only admins can access services management
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <ServicesManagementClient user={safeUser} />;
}

