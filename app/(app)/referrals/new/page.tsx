import ReferralFormClient from '@/components/ReferralFormClient';
import { requireReferralFormAccess } from '@/lib/referrals-page';

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  // Roles grant 'write' for referring (the API checks the same); there is no 'create' action.
  await requireReferralFormAccess('write');

  const params = await searchParams;
  return <ReferralFormClient patientId={params.patientId} visitId={params.visitId} />;
}
