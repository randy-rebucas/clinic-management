import { loadDoctorPermissions } from '@/lib/doctors-page';
import DoctorDetailClient from '@/components/DoctorDetailClient';

export default async function DoctorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const permissions = await loadDoctorPermissions('read');
  const { id } = await params;
  const { saved } = await searchParams;
  return <DoctorDetailClient doctorId={id} permissions={permissions} saved={saved === 'created' || saved === 'edited' ? saved : null} />;
}
