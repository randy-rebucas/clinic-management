import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import DoctorEditClient from '@/components/DoctorEditClient';

export default async function DoctorEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  await requirePagePermission('doctors', 'update');

  const { id } = await params;
  return <DoctorEditClient doctorId={id} />;
}
