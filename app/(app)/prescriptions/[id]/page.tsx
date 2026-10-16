import PrescriptionDetailClient from '@/components/PrescriptionDetailClient';
import { loadPrescriptionDetailPermissions } from '@/lib/prescriptions-page';

export default async function PrescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await loadPrescriptionDetailPermissions();

  const { id } = await params;
  return <PrescriptionDetailClient prescriptionId={id} permissions={permissions} />;
}
