import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import MessagesPageClient from '@/components/messaging/MessagesPageClient';

export default async function MessagesPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  return (
    <Suspense>
      <MessagesPageClient />
    </Suspense>
  );
}
