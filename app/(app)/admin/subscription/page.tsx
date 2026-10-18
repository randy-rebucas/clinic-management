import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadSubscriptionPage } from '@/lib/subscription-page';
import SubscriptionClient from '@/components/admin/SubscriptionClient';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');

  const [data, params] = await Promise.all([loadSubscriptionPage(session), searchParams]);
  return <SubscriptionClient data={data} canceled={Boolean(params.canceled)} />;
}
