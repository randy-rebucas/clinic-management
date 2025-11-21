import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import ReferralsPageClient from '@/components/ReferralsPageClient';

export default async function ReferralsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <ReferralsPageClient />;
}

