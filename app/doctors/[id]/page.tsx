import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DoctorDetailClient from '@/components/DoctorDetailClient';

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <DoctorDetailClient doctorId={id} />;
}

