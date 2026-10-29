import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadSupportThread, markSupportThreadRead } from '@/lib/support-chat';
import { SupportChatThread } from '@/components/platform/SupportChat';
import { LINK } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformChatThreadPage({ params }: { params: Promise<{ userId: string }> }) {
  await requirePlatformPage();
  const { userId } = await params;
  const thread = await loadSupportThread(userId);
  if (!thread) notFound();
  await markSupportThreadRead(userId);
  const { person } = thread;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/platform/chat" className={`${LINK} text-sm`}>Support chat</Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">{person.name}</h1>
        <p className="text-sm text-gray-500">
          <Link href={`/platform/clinics/${person.clinic.id}`} className={LINK}>{person.clinic.name}</Link>
          {person.role ? ` · ${person.role}` : ''} · {person.email}
          {!person.active && ' · inactive account'}
        </p>
      </div>
      <SupportChatThread person={person} initial={thread.messages} hasOlder={thread.hasOlder} />
    </div>
  );
}
