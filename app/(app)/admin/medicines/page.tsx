import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadMedicinesPage } from '@/lib/medicines-page';
import { isMedicineShow } from '@/lib/medicines';
import MedicinesPageClient from '@/components/admin/MedicinesPageClient';

export const dynamic = 'force-dynamic';

/** Whoever may change the medicines list (administrators and owners, and anyone granted medicines:write). */
export default async function MedicinesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; category?: string }>;
}) {
  await requirePagePermission('medicines', 'write');
  const session = await verifySession();
  if (!session) redirect('/login');
  const { show, category } = await searchParams;

  const data = await loadMedicinesPage(session);
  return (
    <MedicinesPageClient
      data={data}
      initialShow={isMedicineShow(show) ? show : 'on-list'}
      initialCategory={typeof category === 'string' ? category.slice(0, 200) : ''}
    />
  );
}
