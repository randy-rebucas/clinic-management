import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { requirePagePermission } from '@/app/lib/auth-helpers';
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

  // Require permission to read visits
  await requirePagePermission('visits', 'read');

  const { id } = await params;
  return <VisitDetailClient visitId={id} />;
}

