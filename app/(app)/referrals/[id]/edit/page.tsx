import ReferralFormClient from '@/components/ReferralFormClient';
import { requireReferralFormAccess } from '@/lib/referrals-page';

export default async function EditReferralPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReferralFormAccess('update');
  const { id } = await params;
  return <ReferralFormClient referralId={id} />;
}
