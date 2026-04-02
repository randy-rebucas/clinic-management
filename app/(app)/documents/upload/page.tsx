import { requirePagePermission } from '@/app/lib/auth-helpers';
import DocumentUploadClient from '@/components/DocumentUploadClient';

export default async function DocumentUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  await requirePagePermission('patients', 'create');

  const params = await searchParams;
  return <DocumentUploadClient patientId={params.patientId} visitId={params.visitId} />;
}
