import { redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { isEmailConfigured } from '@/lib/email';
import { isStaffShow, isStaffStatus, isStaffType } from '@/lib/staff';
import StaffPageClient from '@/components/admin/StaffPageClient';

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; type?: string; status?: string }>;
}) {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');
  const { show, type, status } = await searchParams;

  return (
    <StaffPageClient
      meId={session.userId}
      emailReady={isEmailConfigured()}
      initialShow={isStaffShow(show) ? show : ''}
      initialType={isStaffType(type) ? type : ''}
      initialStatus={isStaffStatus(status) ? status : ''}
    />
  );
}
