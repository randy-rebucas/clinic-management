import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadServicesPage } from '@/lib/services-page';
import { isServiceCategory, isServiceShow } from '@/lib/services';
import ServicesPageClient from '@/components/admin/ServicesPageClient';

export const dynamic = 'force-dynamic';

/** Whoever may change the price list (administrators, and anyone granted services:write). */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; category?: string }>;
}) {
  await requirePagePermission('services', 'write');
  const session = await verifySession();
  if (!session) redirect('/login');
  const { show, category } = await searchParams;

  const data = await loadServicesPage(session);
  return (
    <ServicesPageClient
      data={data}
      initialShow={isServiceShow(show) ? show : 'on-list'}
      initialCategory={isServiceCategory(category) ? category : ''}
    />
  );
}
