import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import MembershipsPageClient from '@/components/MembershipsPageClient';

export default async function MembershipsPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <MembershipsPageClient user={safeUser} />;
}

