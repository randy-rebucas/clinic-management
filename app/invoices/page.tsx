import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InvoicesPageClient from '@/components/InvoicesPageClient';

export default async function InvoicesPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <InvoicesPageClient />;
}

