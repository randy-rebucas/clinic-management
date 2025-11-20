import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import VisitDetailClient from '@/components/VisitDetailClient';

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <VisitDetailClient visitId={id} />;
}

