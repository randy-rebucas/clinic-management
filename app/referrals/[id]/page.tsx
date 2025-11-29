import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import ReferralDetailClient from '@/components/ReferralDetailClient';

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <ReferralDetailClient referralId={id} />;
}

