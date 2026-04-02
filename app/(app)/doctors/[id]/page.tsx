import { requirePagePermission } from '@/app/lib/auth-helpers';
import DoctorDetailClient from '@/components/DoctorDetailClient';

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('doctors', 'read');

  const { id } = await params;
  return <DoctorDetailClient doctorId={id} />;
}
