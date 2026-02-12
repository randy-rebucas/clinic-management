import { Suspense } from 'react';
import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant';
import SubscriptionSuccessClient from '@/components/SubscriptionSuccessClient';

export default async function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; PayerID?: string; plan?: string }>;
}) {
  const user = await getUser();

  if (!user || !('role' in user)) {
    redirect('/login');
  }

  const tenantContext = await getTenantContext();

  if (!tenantContext.tenantId) {
    redirect('/login');
  }

  const params = await searchParams;
  // PayPal returns the order ID as the 'token' query param on redirect
  const token = params.token;
  const plan = params.plan;

  const safeUser = user ? JSON.parse(JSON.stringify(user)) : null;
  const safeTenant = tenantContext.tenant ? JSON.parse(JSON.stringify(tenantContext.tenant)) : null;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SubscriptionSuccessClient
        user={safeUser as { role: string; [key: string]: any }}
        tenant={safeTenant}
        token={token}
        plan={plan}
      />
    </Suspense>
  );
}
