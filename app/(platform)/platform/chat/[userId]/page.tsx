import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft, Building2, CalendarDays, Clock, Mail, Megaphone, MessageSquare, UserRound } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadSupportThread, markSupportThreadRead } from '@/lib/support-chat';
import { SupportChatThread } from '@/components/platform/SupportChat';
import { CARD, FOCUS_RING, H2, Initial, LINK, ago, day } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

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

export default async function PlatformChatThreadPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requirePlatformPage();
  const { userId } = await params;
  const thread = await loadSupportThread(userId);
  if (!thread) notFound();
  await markSupportThreadRead(userId);
  const { person, messages } = thread;
  const live = messages.filter((m) => !m.deleted);
  const fromUs = live.filter((m) => m.fromSupport).length;
  const firstAt = messages[0]?.createdAt ?? null;
  const lastAt = messages[messages.length - 1]?.createdAt ?? null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform/chat" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Support chat
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <Initial name={person.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-gray-900">{person.name}</h1>
              {!person.active && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">Inactive account</span>
              )}
            </div>
            <p className="truncate text-sm text-gray-500">
              <Link href={`/platform/clinics/${person.clinic.id}`} className={LINK}>{person.clinic.name}</Link>
              {person.role ? ` · ${person.role}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SupportChatThread person={person} initial={messages} hasOlder={thread.hasOlder} meEmail={session.email} />
        </div>

        <aside className={`${CARD} p-4 lg:sticky lg:top-6`} aria-labelledby="person-facts">
          <h2 id="person-facts" className={H2}>About</h2>
          <dl className="mt-4 space-y-4">
            <Fact icon={Building2} label="Clinic">
              <Link href={`/platform/clinics/${person.clinic.id}`} className={LINK}>{person.clinic.name}</Link>
            </Fact>
            <Fact icon={UserRound} label="Role">{person.role || '—'}</Fact>
            <Fact icon={Mail} label="Email">
              <a href={`mailto:${person.email}`} className={LINK}>{person.email}</a>
            </Fact>
            <Fact icon={CalendarDays} label="First message">{firstAt ? day(firstAt) : 'No messages yet'}</Fact>
            <Fact icon={MessageSquare} label="Messages">
              {live.length - fromUs} from {person.name.split(' ')[0]} · {fromUs} from us
              {thread.hasOlder && <span className="text-gray-500"> (latest 200)</span>}
            </Fact>
            <Fact icon={Clock} label="Last message">{lastAt ? ago(lastAt) : '—'}</Fact>
          </dl>
          <Link
            href={`/platform/chat/broadcast?clinic=${person.clinic.id}`}
            className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
          >
            <Megaphone aria-hidden="true" className="size-4" /> Message everyone at this clinic
          </Link>
        </aside>
      </div>
    </div>
  );
}
