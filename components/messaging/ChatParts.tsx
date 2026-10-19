'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

export interface ChatAction {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
}

/**
 * "More actions" button with a small popup menu. The menu is fixed-positioned so a scrolling
 * thread can't clip it, flips upward near the bottom of the viewport, and closes on scroll.
 */
export function ActionMenu({
  actions,
  label,
  align = 'end',
  triggerClassName = '',
  onOpenChange,
}: {
  actions: ChatAction[];
  label: string;
  align?: 'start' | 'end';
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) setPos(null);
    onOpenChange?.(next);
  };

  // Place the menu once it has rendered and can be measured
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below;
    setPos(align === 'end' ? { top, right: window.innerWidth - r.right } : { top, left: r.left });
    itemRefs.current[0]?.focus({ preventScroll: true });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`${triggerClassName} ${CHAT_FOCUS_RING}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm5.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm5.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { top: -9999, left: -9999 }}
          className="fixed z-[60] min-w-[11rem] py-1 rounded-lg border border-gray-200 bg-white shadow-[0_8px_30px_rgb(15,23,42,0.12)]"
        >
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm focus-visible:outline-none ${
                a.danger
                  ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50'
              }`}
            >
              {a.icon && <span className={`w-4 h-4 shrink-0 ${a.danger ? '' : 'text-gray-400'}`} aria-hidden="true">{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ActionIcon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

export const ACTION_ICONS = {
  copy: <ActionIcon d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  edit: <ActionIcon d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1.464-4.536z" />,
  trash: <ActionIcon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />,
  unread: <ActionIcon d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
};

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
