import { requirePagePermission } from '@/app/lib/auth-helpers';
import ReferralDetailClient from '@/components/ReferralDetailClient';

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('referrals', 'read');

  const { id } = await params;
  return <ReferralDetailClient referralId={id} />;
}
