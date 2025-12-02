import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import LabResultDetailClient from '@/components/LabResultDetailClient';

export default async function LabResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <LabResultDetailClient labResultId={id} />;
}

