import { requirePagePermission } from '@/app/lib/auth-helpers';
import LabResultFormClient from '@/components/LabResultFormClient';

export default async function NewLabResultPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  await requirePagePermission('lab-results', 'create');

  const params = await searchParams;
  return <LabResultFormClient patientId={params.patientId} />;
}
