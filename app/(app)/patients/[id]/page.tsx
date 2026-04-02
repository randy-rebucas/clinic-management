import { requirePagePermission } from '@/app/lib/auth-helpers';
import PatientDetailClient from '@/components/PatientDetailClient';

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('patients', 'read');

  const { id } = await params;
  return <PatientDetailClient patientId={id} />;
}
