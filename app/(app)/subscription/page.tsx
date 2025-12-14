import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant';
import SubscriptionPageClient from '@/components/SubscriptionPageClient';

export default async function SubscriptionPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Get tenant context to check subscription
  const tenantContext = await getTenantContext();
  
  if (!tenantContext.tenantId) {
    redirect('/login');
  }

  // Ensure user is a plain object before passing to Client Component
  const safeUser = user ? JSON.parse(JSON.stringify(user)) : null;
  const safeTenant = tenantContext.tenant ? JSON.parse(JSON.stringify(tenantContext.tenant)) : null;
  
  return <SubscriptionPageClient user={safeUser as { role: string; [key: string]: any }} tenant={safeTenant} />;
}
