import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DocumentDetailClient from '@/components/DocumentDetailClient';

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <DocumentDetailClient documentId={id} />;
}

