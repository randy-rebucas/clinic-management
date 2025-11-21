import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DocumentsPageClient from '@/components/DocumentsPageClient';

export default async function DocumentsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  return <DocumentsPageClient />;
}

