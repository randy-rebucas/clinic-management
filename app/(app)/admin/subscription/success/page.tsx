import { requireAdmin } from '@/app/lib/auth-helpers';
import { isValidPayPalOrderId } from '@/lib/paypal';
import SubscriptionReturnClient from '@/components/admin/SubscriptionReturnClient';

export const dynamic = 'force-dynamic';

/** PayPal returns here with the order id as `token`; plan and cycle come from the stored order. */
export default async function SubscriptionReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await requireAdmin();
  const { token } = await searchParams;
  // PayMongo checkouts come back with our own reference (pm_…); PayPal with its order id.
  if (token && /^pm_[a-f0-9]{24}$/.test(token)) return <SubscriptionReturnClient orderId={token} gateway="PayMongo" />;
  return <SubscriptionReturnClient orderId={isValidPayPalOrderId(token) ? token : null} gateway="PayPal" />;
}
