import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { isEmailConfigured } from '@/lib/email';
import { isUserShow } from '@/lib/users';
import UsersPageClient from '@/components/admin/UsersPageClient';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ show?: string; role?: string }> }) {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');
  const { show, role } = await searchParams;

  return (
    <UsersPageClient
      meId={session.userId}
      emailReady={isEmailConfigured()}
      initialShow={isUserShow(show) ? show : ''}
      initialRole={typeof role === 'string' && /^[a-f0-9]{24}$/i.test(role) ? role : ''}
    />
  );
}
