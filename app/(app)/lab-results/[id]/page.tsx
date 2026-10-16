import LabResultDetailClient from '@/components/LabResultDetailClient';
import { loadLabResultDetailPermissions } from '@/lib/lab-results-page';

export default async function LabResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await loadLabResultDetailPermissions();

  const { id } = await params;
  return <LabResultDetailClient labResultId={id} permissions={permissions} />;
}
