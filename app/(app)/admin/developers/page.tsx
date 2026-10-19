import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadDeveloperPage } from '@/lib/developer-page';
import DevelopersClient from '@/components/admin/DevelopersClient';

export const dynamic = 'force-dynamic';

export default async function DevelopersPage() {
  await requireAdmin();
  const session = await verifySession();
  if (!session?.tenantId) redirect('/login');
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const data = await loadDeveloperPage(session.tenantId, `${proto}://${h.get('host')}`);
  return <DevelopersClient data={data} readOnly={!!session.imp} />;
}
