'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isThisYear, isToday, isYesterday } from 'date-fns';
import { chatInitials, type ChatUser, type ConversationSummary } from '@/lib/messaging';

export const CHAT_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1';

/** Short timestamp for list rows: time today, weekday-free date otherwise. */
export function formatListTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return isThisYear(d) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
}

/** Day separator label inside a thread. */
export function formatDayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return isThisYear(d) ? format(d, 'EEEE, MMM d') : format(d, 'MMM d, yyyy');
}

export function ChatAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-10 h-10 text-sm';
  return (
    <span
      aria-hidden="true"
      className={`${dims} rounded-full bg-brand-teal-light text-brand-teal-dark font-semibold flex items-center justify-center shrink-0`}
    >
      {chatInitials(name)}
    </span>
  );
}

export function ConversationList({
  conversations,
  meId,
  activeId,
  loaded,
  onSelect,
}: {
  conversations: ConversationSummary[];
  meId: string | null;
  activeId?: string | null;
  loaded: boolean;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  if (!loaded) {
    return (
      <ul className="divide-y divide-gray-100" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
            <span className="flex-1 space-y-2">
              <span className="block h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
              <span className="block h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-900">No conversations yet</p>
        <p className="mt-1 text-sm text-gray-500">Start one by searching for a colleague above.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {conversations.map((c) => {
        const active = c.id === activeId;
        const unread = c.unread > 0;
        const preview = c.lastMessage
          ? `${c.lastMessage.senderId === meId ? 'You: ' : ''}${c.lastMessage.body}`
          : 'No messages yet';
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              aria-current={active ? 'true' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${CHAT_FOCUS_RING} focus-visible:ring-inset ${
                active ? 'bg-brand-teal-light/60' : 'hover:bg-gray-50'
              }`}
            >
              <ChatAvatar name={c.other.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {c.other.name}
                  </span>
                  {c.lastMessageAt && (
                    <span className={`shrink-0 text-xs tabular-nums ${unread ? 'text-brand-teal-dark font-medium' : 'text-gray-400'}`}>
                      {formatListTime(c.lastMessageAt)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${unread ? 'text-gray-900' : 'text-gray-500'}`}>{preview}</span>
                  {unread && (
                    <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-teal-dark text-white text-xs font-semibold flex items-center justify-center tabular-nums">
                      <span className="sr-only">Unread messages: </span>
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Search box that lists clinic staff; picking one calls onPick. */
export function ContactSearch({
  onPick,
  autoFocus,
  placeholder = 'Search colleagues to message',
}: {
  onPick: (user: ChatUser) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/messages/contacts?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) setResults(data.data);
      } catch (error: any) {
        if (error?.name !== 'AbortError') console.error('Error searching contacts:', error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (user: ChatUser) => {
    setOpen(false);
    setQuery('');
    onPick(user);
  };

  return (
    <div className="relative" ref={boxRef}>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault();
            pick(results[0]);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full h-9 pl-9 pr-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
      />
      {open && (
        <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-[0_8px_30px_rgb(15,23,42,0.1)] z-10">
          {loading && results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">No colleagues found</p>
          ) : (
            <ul className="py-1">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => pick(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
                  >
                    <ChatAvatar name={u.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{u.name}</span>
                      {u.role && <span className="block truncate text-xs text-gray-500 capitalize">{u.role}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
