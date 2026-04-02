import { requirePagePermission } from '@/app/lib/auth-helpers';
import ReferralFormClient from '@/components/ReferralFormClient';

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  await requirePagePermission('referrals', 'create');

  const params = await searchParams;
  return <ReferralFormClient patientId={params.patientId} />;
}
