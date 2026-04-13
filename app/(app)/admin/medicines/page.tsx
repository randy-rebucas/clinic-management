import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import MedicinesManagementClient from '@/components/MedicinesManagementClient';

export default async function MedicinesManagementPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Only admins can access medicines management
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <MedicinesManagementClient user={safeUser} />;
}

