import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import QueuePageClient from '@/components/QueuePageClient';

export default async function QueuePage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <QueuePageClient />;
}

