import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import BackupsClient from '@/components/admin/BackupsClient';

/** /admin/backups — the clinic's in-app backups, for administrators and owners. */
export default async function BackupsPage() {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');
  return <BackupsClient meId={session.userId} />;
}
