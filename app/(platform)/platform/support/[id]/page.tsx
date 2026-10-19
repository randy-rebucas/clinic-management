import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadSupportTicket } from '@/lib/platform-console';
import SupportThread from '@/components/platform/SupportThread';
import { LINK, SupportStatusBadge, day } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const t = await loadSupportTicket(id);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/platform/support" className={`${LINK} text-sm`}>Support</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{t.subject}</h1>
          <SupportStatusBadge status={t.status} />
        </div>
        <p className="text-sm text-gray-500">
          {t.reference} · {t.category} · opened {day(t.createdAt)} ·{' '}
          {t.clinic ? <Link href={`/platform/clinics/${t.clinic.id}`} className={LINK}>{t.clinic.name}</Link> : 'no clinic'}
          {t.source === 'medical-rep' ? ' · medical rep' : ''}
        </p>
      </div>
      <SupportThread
        side="platform"
        thread={t.thread}
        status={t.status}
        replyUrl={`/api/platform/support/${t.id}/replies`}
        statusUrl={`/api/platform/support/${t.id}`}
      />
    </div>
  );
}
