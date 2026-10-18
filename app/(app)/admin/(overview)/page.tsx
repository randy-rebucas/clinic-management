import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadAdminOverview } from '@/lib/admin-overview';
import AdminOverviewClient from '@/components/admin/AdminOverviewClient';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');

  const overview = await loadAdminOverview(session);
  return <AdminOverviewClient overview={overview} />;
}
