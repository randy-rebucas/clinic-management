import { requireAdmin } from '@/app/lib/auth-helpers';
import SubscriptionReturnClient from '@/components/admin/SubscriptionReturnClient';

export const dynamic = 'force-dynamic';

/** PayMongo returns here with our own order reference (pm_…) as `token`. */
export default async function SubscriptionReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await requireAdmin();
  const { token } = await searchParams;
  return <SubscriptionReturnClient orderId={token && /^pm_[a-f0-9]{24}$/.test(token) ? token : null} />;
}
