import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import DocumentUploadClient from '@/components/DocumentUploadClient';

export default async function DocumentUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  return <DocumentUploadClient patientId={params.patientId} visitId={params.visitId} />;
}

