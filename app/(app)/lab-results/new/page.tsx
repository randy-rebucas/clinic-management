import { requirePagePermission } from '@/app/lib/auth-helpers';
import LabResultFormClient from '@/components/LabResultFormClient';

export default async function NewLabResultPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  // Roles grant 'write' for ordering (the API checks the same); there is no 'create' action.
  await requirePagePermission('lab-results', 'write');

  const params = await searchParams;
  return <LabResultFormClient patientId={params.patientId} visitId={params.visitId} />;
}
