'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMessaging } from './MessagingProvider';
import { ChatAvatar, CHAT_FOCUS_RING, ContactSearch, ConversationList } from './ChatParts';
import ChatThread from './ChatThread';

export default function MessagesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('c');
  const { enabled, meId, conversations, loaded, startConversation, upsertConversation } = useMessaging();
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const notFound = Boolean(selectedId) && notFoundId === selectedId;

  const select = (id: string | null) => {
    router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
  };

  // Conversation linked by URL (push notification, dock "open" button) but not in the loaded list yet
  useEffect(() => {
    if (!selectedId || !loaded || selected) return;
    const controller = new AbortController();
    fetch(`/api/messages/conversations/${selectedId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) upsertConversation(data.data);
        else setNotFoundId(selectedId);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setNotFoundId(selectedId);
      });
    return () => controller.abort();
  }, [selectedId, loaded, selected, upsertConversation]);

  if (!enabled && meId) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 text-center text-sm text-gray-500">
        Messaging is available to clinic staff accounts.
      </div>
    );
  }

  return (
    <div className="px-0 sm:px-6 lg:px-8 sm:py-6">
      <div className="h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-7rem)] bg-white sm:rounded-lg border-gray-200 sm:border overflow-hidden grid md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <aside className={`min-h-0 flex-col border-r border-gray-200 ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <h1 className="text-lg font-semibold text-gray-900">Messages</h1>
            <p className="text-xs text-gray-500 mt-0.5">Private conversations with your clinic team</p>
            <div className="mt-3">
              <ContactSearch
                placeholder="New message: search colleagues"
                onPick={async (user) => {
                  const existing = conversations.find((c) => c.other.id === user.id);
                  const conversation = existing ?? (await startConversation(user.id));
                  if (conversation) select(conversation.id);
                }}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              meId={meId}
              loaded={loaded}
              activeId={selectedId}
              onSelect={(c) => select(c.id)}
            />
          </div>
        </aside>

        {/* Thread */}
        <section className={`min-h-0 flex-col ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {selected ? (
            <>
              <header className="h-16 shrink-0 flex items-center gap-3 px-3 sm:px-6 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => select(null)}
                  className={`md:hidden p-2 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 ${CHAT_FOCUS_RING}`}
                  aria-label="Back to conversations"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <ChatAvatar name={selected.other.name} />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-gray-900">{selected.other.name}</h2>
                  {selected.other.role && <p className="truncate text-xs text-gray-500 capitalize">{selected.other.role}</p>}
                </div>
              </header>
              <div className="flex-1 min-h-0">
                <ChatThread key={selected.id} conversation={selected} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              {notFound ? (
                <>
                  <p className="text-sm font-medium text-gray-900">Conversation not found</p>
                  <p className="mt-1 text-sm text-gray-500">It may have been removed, or it isn&apos;t yours.</p>
                </>
              ) : selectedId ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <>
                  <span className="w-12 h-12 rounded-full bg-brand-teal-light text-brand-teal-dark flex items-center justify-center" aria-hidden="true">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </span>
                  <p className="mt-3 text-sm font-medium text-gray-900">Select a conversation</p>
                  <p className="mt-1 text-sm text-gray-500">Or search for a colleague to start a new one.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
