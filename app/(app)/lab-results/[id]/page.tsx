import { requirePagePermission } from '@/app/lib/auth-helpers';
import LabResultDetailClient from '@/components/LabResultDetailClient';

export default async function LabResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('lab-results', 'read');

  const { id } = await params;
  return <LabResultDetailClient labResultId={id} />;
}
