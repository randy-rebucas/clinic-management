import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadRolesPage } from '@/lib/roles-page';
import RolesPageClient from '@/components/admin/RolesPageClient';

export const dynamic = 'force-dynamic';

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');
  const { role } = await searchParams;

  const data = await loadRolesPage(session);
  return <RolesPageClient data={data} initialRole={typeof role === 'string' && /^[a-f0-9]{24}$/i.test(role) ? role : ''} />;
}
