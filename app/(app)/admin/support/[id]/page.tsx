import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadSupportTicket } from '@/lib/platform-console';
import SupportThread from '@/components/platform/SupportThread';
import { SupportStatusBadge } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const session = await verifySession();
  if (!session?.tenantId) redirect('/login');
  const { id } = await params;
  const t = await loadSupportTicket(id, session.tenantId);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin/support" className="text-sm font-medium text-brand-teal-deep hover:underline">Support</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{t.subject}</h1>
          <SupportStatusBadge status={t.status} />
        </div>
        <p className="text-sm text-gray-500">{t.reference}</p>
      </div>
      <SupportThread side="requester" thread={t.thread} status={t.status} replyUrl={`/api/support/${t.id}/replies`} />
    </div>
  );
}
