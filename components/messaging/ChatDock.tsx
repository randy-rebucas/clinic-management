'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMessaging } from './MessagingProvider';
import { ChatAvatar, CHAT_FOCUS_RING, ContactSearch, ConversationList } from './ChatParts';
import ChatThread from './ChatThread';
import ConversationActions from './ConversationActions';
import type { ConversationSummary } from '@/lib/messaging';

const ICON_BUTTON = `p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors ${CHAT_FOCUS_RING}`;
const PANEL_SHADOW = 'shadow-[0_-4px_24px_rgb(15,23,42,0.12)]';

function Chevron({ up }: { up: boolean }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
    </svg>
  );
}

function ChatWindow({ conversation, minimized }: { conversation: ConversationSummary; minimized: boolean }) {
  const { closeChat, toggleMinimized } = useMessaging();
  const unread = conversation.unread > 0;

  return (
    <section
      aria-label={`Chat with ${conversation.other.name}`}
      className={`w-80 flex flex-col bg-white border border-gray-200 border-b-0 rounded-t-lg overflow-hidden ${PANEL_SHADOW} ${
        minimized ? 'h-12' : 'h-[min(28rem,calc(100vh-6rem))]'
      }`}
    >
      <header className={`h-12 shrink-0 flex items-center gap-2 pl-2 pr-1.5 border-b border-gray-200 ${unread && minimized ? 'bg-brand-teal-light' : 'bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleMinimized(conversation.id)}
          aria-expanded={!minimized}
          className={`min-w-0 flex-1 flex items-center gap-2 rounded-md p-1 text-left ${CHAT_FOCUS_RING}`}
        >
          <ChatAvatar name={conversation.other.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-900">{conversation.other.name}</span>
            {conversation.other.role && (
              <span className="block truncate text-[11px] leading-tight text-gray-500 capitalize">{conversation.other.role}</span>
            )}
          </span>
          {unread && minimized && (
            <span className="ml-auto shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-teal-dark text-white text-xs font-semibold flex items-center justify-center tabular-nums">
              {conversation.unread}
            </span>
          )}
        </button>
        <ConversationActions
          conversation={conversation}
          onLeave={() => closeChat(conversation.id)}
          triggerClassName="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        />
        <Link
          href={`/messages?c=${conversation.id}`}
          onClick={() => closeChat(conversation.id)}
          className={ICON_BUTTON}
          title="Open in Messages"
          aria-label="Open in Messages"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => toggleMinimized(conversation.id)}
          className={ICON_BUTTON}
          title={minimized ? 'Expand' : 'Minimize'}
          aria-label={minimized ? 'Expand chat' : 'Minimize chat'}
        >
          <Chevron up={minimized} />
        </button>
        <button
          type="button"
          onClick={() => closeChat(conversation.id)}
          className={ICON_BUTTON}
          title="Close"
          aria-label="Close chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>
      {!minimized && <ChatThread conversation={conversation} compact />}
    </section>
  );
}

/**
 * LinkedIn-style floating messaging: a collapsible conversation list docked bottom-right,
 * with chat windows opening beside it. Not shown on the Messages page itself.
 */
export default function ChatDock() {
  const pathname = usePathname();
  const { enabled, meId, conversations, totalUnread, loaded, openChats, openChat, closeChat, startConversation } =
    useMessaging();
  // Remember whether the list was left open, per browser. The dock renders nothing until the
  // user loads client-side, so reading storage in the initializer can't cause a hydration mismatch.
  const [expanded, setExpanded] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('chatDock:expanded') === '1';
    } catch {
      return false;
    }
  });
  const [composing, setComposing] = useState(false);

  const setExpandedPersist = (next: boolean) => {
    setExpanded(next);
    if (!next) setComposing(false);
    try {
      localStorage.setItem('chatDock:expanded', next ? '1' : '0');
    } catch {}
  };

  const onMessagesPage = pathname === '/messages' || pathname?.startsWith('/messages/');
  if (!enabled || onMessagesPage) return null;

  const windows = openChats
    .map((c) => ({ ...c, conversation: conversations.find((x) => x.id === c.id) }))
    .filter((c): c is typeof c & { conversation: ConversationSummary } => Boolean(c.conversation));

  return (
    <div className="hidden md:flex fixed bottom-0 right-4 lg:right-6 z-40 flex-row-reverse items-end gap-3 pointer-events-none">
      {/* Conversation list */}
      <section
        aria-label="Messaging"
        className={`pointer-events-auto w-72 flex flex-col bg-white border border-gray-200 border-b-0 rounded-t-lg overflow-hidden ${PANEL_SHADOW} ${
          expanded ? 'h-[min(34rem,calc(100vh-6rem))]' : 'h-12'
        }`}
      >
        <header className="h-12 shrink-0 flex items-center gap-1 pl-2 pr-1.5 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setExpandedPersist(!expanded)}
            aria-expanded={expanded}
            className={`min-w-0 flex-1 flex items-center gap-2 rounded-md p-1 text-left ${CHAT_FOCUS_RING}`}
          >
            <span className="w-8 h-8 rounded-full bg-brand-teal-dark text-white flex items-center justify-center shrink-0" aria-hidden="true">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-gray-900">Messaging</span>
            {totalUnread > 0 && (
              <span className="ml-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-xs font-semibold flex items-center justify-center tabular-nums">
                <span className="sr-only">Unread: </span>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setExpandedPersist(true);
              setComposing((v) => !v);
            }}
            className={ICON_BUTTON}
            title="New message"
            aria-label="New message"
            aria-pressed={composing}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setExpandedPersist(!expanded)}
            className={ICON_BUTTON}
            aria-label={expanded ? 'Collapse messaging' : 'Expand messaging'}
          >
            <Chevron up={!expanded} />
          </button>
        </header>

        {expanded && (
          <>
            <div className="p-2.5 border-b border-gray-100">
              <ContactSearch
                key={composing ? 'compose' : 'search'}
                autoFocus={composing}
                placeholder={composing ? 'Who do you want to message?' : 'Search colleagues'}
                onPick={async (user) => {
                  setComposing(false);
                  const existing = conversations.find((c) => c.other.id === user.id);
                  const conversation = existing ?? (await startConversation(user.id));
                  if (conversation) openChat(conversation.id);
                }}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ConversationList
                conversations={conversations}
                meId={meId}
                loaded={loaded}
                activeId={openChats[0]?.id}
                onSelect={(c) => openChat(c.id)}
              />
            </div>
            <Link
              href="/messages"
              className={`shrink-0 border-t border-gray-100 px-4 py-2.5 text-center text-xs font-medium text-brand-teal-dark hover:bg-gray-50 ${CHAT_FOCUS_RING} focus-visible:ring-inset`}
            >
              See all in Messages
            </Link>
          </>
        )}
      </section>

      {windows.map((w) => (
        <div key={w.id} className="pointer-events-auto">
          <ChatWindow conversation={w.conversation} minimized={w.minimized} />
        </div>
      ))}
      {/* Windows whose conversation vanished (e.g. list refreshed past the limit) close themselves */}
      <StaleChatCloser ids={openChats.filter((c) => !windows.some((w) => w.id === c.id)).map((c) => c.id)} loaded={loaded} close={closeChat} />
    </div>
  );
}

function StaleChatCloser({ ids, loaded, close }: { ids: string[]; loaded: boolean; close: (id: string) => void }) {
  const key = ids.join(',');
  useEffect(() => {
    if (!loaded || !key) return;
    key.split(',').forEach(close);
  }, [key, loaded, close]);
  return null;
}
