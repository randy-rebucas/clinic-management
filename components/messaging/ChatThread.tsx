'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { MESSAGE_MAX_LENGTH, type ChatMessage, type ConversationSummary } from '@/lib/messaging';
import { useMessaging } from './MessagingProvider';
import { formatDayLabel } from './ChatParts';

const POLL_MS = 4000;

type ThreadMessage = ChatMessage & { pending?: boolean };

function mergeMessages(current: ThreadMessage[], incoming: ChatMessage[]) {
  const seen = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (fresh.length === 0) return current;
  return [...current, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Message history + composer for one conversation. Used by the floating dock and the Messages page. */
export default function ChatThread({
  conversation,
  compact = false,
}: {
  conversation: ConversationSummary;
  compact?: boolean;
}) {
  const { meId, markRead, noteSent } = useMessaging();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Whether to keep the view pinned to the newest message after the next render
  const stickToBottom = useRef(true);
  // Scroll height before prepending older messages, so the view doesn't jump
  const prependFrom = useRef<number | null>(null);
  const messagesRef = useRef<ThreadMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const conversationId = conversation.id;
  const base = `/api/messages/conversations/${conversationId}/messages`;

  // Initial load. Callers key this component by conversation id, so it runs once per thread.
  useEffect(() => {
    const controller = new AbortController();
    fetch(base, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        setMessages(data.data.messages);
        setHasMore(data.data.hasMore);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError('Could not load messages.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);

  // Poll for new messages while the tab is visible
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const last = [...messagesRef.current].reverse().find((m) => !m.pending);
      const url = last ? `${base}?after=${encodeURIComponent(last.createdAt)}` : base;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled || !data.success) return;
        const el = scrollRef.current;
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        setMessages((prev) => mergeMessages(prev, data.data.messages));
      } catch {
        // transient; next tick retries
      }
    };
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [base, loading]);

  // Mark read whenever unread messages are on screen and the tab is visible
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible' && conversation.unread > 0) markRead(conversationId);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [conversationId, conversation.unread, markRead]);

  // A message from the other person arrived while we're looking: clear it on the server too
  const lastIncomingId = [...messages].reverse().find((m) => m.senderId !== meId)?.id;
  useEffect(() => {
    if (!lastIncomingId || loading) return;
    if (document.visibilityState === 'visible') markRead(conversationId);
  }, [lastIncomingId, loading, conversationId, markRead]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependFrom.current !== null) {
      el.scrollTop = el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadOlder = async () => {
    const first = messages.find((m) => !m.pending);
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`${base}?before=${encodeURIComponent(first.createdAt)}`);
      const data = await res.json();
      if (data.success) {
        prependFrom.current = scrollRef.current?.scrollHeight ?? null;
        stickToBottom.current = false;
        setMessages((prev) => mergeMessages(prev, data.data.messages));
        setHasMore(data.data.hasMore);
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !meId) return;
    const tempId = `pending-${Date.now()}`;
    stickToBottom.current = true;
    setError(null);
    setDraft('');
    setMessages((prev) => [...prev, { id: tempId, senderId: meId, body, createdAt: new Date().toISOString(), pending: true }]);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const sent: ChatMessage = data.data;
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return mergeMessages(withoutTemp, [sent]);
      });
      noteSent(conversationId, sent);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft((current) => current || body);
      setError('Message not sent. Try again.');
    }
    textareaRef.current?.focus();
  }, [draft, meId, base, conversationId, noteSent]);

  // Grow the composer with its content, up to a cap
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, compact ? 96 : 160)}px`;
  }, [draft, compact]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto ${compact ? 'px-3 py-3' : 'px-4 sm:px-6 py-4'}`}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${conversation.other.name}`}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : messages.length === 0 && !error ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm font-medium text-gray-900">Say hello to {conversation.other.name.split(' ')[0]}</p>
            <p className="mt-1 text-xs text-gray-500">Messages are visible only to the two of you.</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="text-xs font-medium text-brand-teal-dark hover:underline disabled:opacity-60 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                >
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            <ol className="space-y-1">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const mine = m.senderId === meId;
                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const grouped = prev && !newDay && prev.senderId === m.senderId &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <li className="flex items-center gap-3 py-2" aria-hidden="true">
                        <span className="h-px flex-1 bg-gray-200" />
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          {formatDayLabel(m.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-gray-200" />
                      </li>
                    )}
                    <li className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-1.5'}`}>
                      <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-2xl ${
                            mine
                              ? 'bg-brand-teal-dark text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          } ${m.pending ? 'opacity-60' : ''}`}
                        >
                          {m.body}
                        </div>
                        {!grouped || i === messages.length - 1 ? (
                          <span className="mt-0.5 px-1 text-[11px] text-gray-400 tabular-nums">
                            {m.pending ? 'Sending…' : format(new Date(m.createdAt), 'h:mm a')}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className={`border-t border-gray-200 bg-white ${compact ? 'p-2' : 'p-3 sm:p-4'}`}
      >
        {error && <p role="alert" className="mb-2 px-1 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder="Write a message…"
            aria-label={`Message ${conversation.other.name}`}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="h-9 w-9 shrink-0 rounded-lg bg-brand-teal-dark text-white flex items-center justify-center transition-colors hover:bg-brand-teal-deep disabled:bg-gray-200 disabled:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-6 6m6-6l6 6" />
            </svg>
          </button>
        </div>
        {!compact && <p className="mt-1.5 px-1 text-[11px] text-gray-400">Enter to send · Shift + Enter for a new line</p>}
      </form>
    </div>
  );
}
