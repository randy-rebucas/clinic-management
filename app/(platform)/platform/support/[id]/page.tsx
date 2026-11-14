import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft, BriefcaseMedical, Building2, CalendarDays, Clock, Mail, MessageSquare, Tag, Timer } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadSupportTicket } from '@/lib/platform-console';
import SupportThread from '@/components/platform/SupportThread';
import { CARD, H2, LINK, SupportStatusBadge, ago, day, hoursLabel, hoursSince } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  technical: 'Technical',
  billing: 'Billing',
  account: 'Account',
  onboarding: 'Onboarding',
  other: 'Other',
};

function Fact({ icon: Icon, label, children }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="break-words text-sm text-gray-900">{children}</dd>
      </div>
    </div>
  );
}

export default async function PlatformTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const t = await loadSupportTicket(id);
  if (!t) notFound();

  const ours = t.thread.filter((m) => m.authorType === 'platform');
  const firstReply = ours[0];
  const firstReplyHours = firstReply ? (Date.parse(firstReply.createdAt) - Date.parse(t.createdAt)) / 3_600_000 : null;
  const open = t.status === 'open' || t.status === 'in-progress';
  const waitingOnUs = open && t.lastReplyBy !== 'platform';
  const fromClinic = t.source === 'clinic';

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform/support" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Support
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{t.subject}</h1>
          <SupportStatusBadge status={t.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          <span className="font-mono">{t.reference}</span> · opened {ago(t.createdAt).toLowerCase()} by {t.email}
          {waitingOnUs && <span className="font-medium text-amber-700"> · waiting on our reply for {hoursSince(t.lastActivityAt)}</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SupportThread
            side="platform"
            thread={t.thread}
            status={t.status}
            replyUrl={`/api/platform/support/${t.id}/replies`}
            statusUrl={`/api/platform/support/${t.id}`}
          />
        </div>

        <aside className={`${CARD} p-4 lg:sticky lg:top-6`} aria-labelledby="request-facts">
          <h2 id="request-facts" className={H2}>Request</h2>
          <dl className="mt-4 space-y-4">
            <Fact icon={fromClinic ? Building2 : BriefcaseMedical} label={fromClinic ? 'Clinic' : 'From'}>
              {t.clinic ? (
                <Link href={`/platform/clinics/${t.clinic.id}`} className={LINK}>{t.clinic.name}</Link>
              ) : fromClinic ? 'No clinic on record' : 'Medical rep'}
              {t.clinic && !fromClinic && <span className="text-gray-500"> · medical rep</span>}
            </Fact>
            <Fact icon={Mail} label="Requester">
              <a href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject} [${t.reference}]`)}`} className={LINK}>{t.email}</a>
            </Fact>
            <Fact icon={Tag} label="Topic">{CATEGORY_LABEL[t.category] ?? t.category}</Fact>
            <Fact icon={CalendarDays} label="Opened">{day(t.createdAt)}</Fact>
            <Fact icon={Timer} label="First reply">
              {firstReplyHours !== null ? (
                <>{hoursLabel(firstReplyHours)} after it was opened</>
              ) : (
                <span className={open ? 'font-medium text-amber-700' : 'text-gray-500'}>Not replied to yet</span>
              )}
            </Fact>
            <Fact icon={MessageSquare} label="Messages">
              {t.thread.length - ours.length} from requester · {ours.length} from us
            </Fact>
            <Fact icon={Clock} label="Last activity">{ago(t.lastActivityAt)}</Fact>
          </dl>
        </aside>
      </div>
    </div>
  );
}
