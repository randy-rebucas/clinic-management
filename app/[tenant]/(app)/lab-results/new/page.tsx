import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import LabResultFormClient from '@/components/LabResultFormClient';

export default async function NewLabResultPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  return <LabResultFormClient patientId={params.patientId} />;
}

