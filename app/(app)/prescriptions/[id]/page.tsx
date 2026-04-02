import { requirePagePermission } from '@/app/lib/auth-helpers';
import PrescriptionDetailClient from '@/components/PrescriptionDetailClient';

export default async function PrescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('prescriptions', 'read');

  const { id } = await params;
  return <PrescriptionDetailClient prescriptionId={id} />;
}
