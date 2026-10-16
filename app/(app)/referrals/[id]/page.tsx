import ReferralDetailClient from '@/components/ReferralDetailClient';
import { loadReferralDetailPermissions } from '@/lib/referrals-page';

export default async function ReferralDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const permissions = await loadReferralDetailPermissions();
  const { id } = await params;
  const { saved } = await searchParams;
  return <ReferralDetailClient referralId={id} permissions={permissions} saved={saved === 'new' || saved === 'edit' ? saved : undefined} />;
}
