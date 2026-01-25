import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import ReferralFormClient from '@/components/ReferralFormClient';

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  return <ReferralFormClient patientId={params.patientId} />;
}

