import { loadDoctorPermissions } from '@/lib/doctors-page';
import DoctorEditClient from '@/components/DoctorEditClient';

export default async function DoctorEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Editing a profile is doctors:update, the PUT check.
  await loadDoctorPermissions('update');
  const { id } = await params;
  return <DoctorEditClient doctorId={id} />;
}
