'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { MESSAGE_MAX_LENGTH, canEditMessage, type ChatMessage, type ConversationSummary } from '@/lib/messaging';
import { AlertDialog } from '@/components/ui/Modal';
import { useMessaging } from './MessagingProvider';
import { ACTION_ICONS, ActionMenu, CHAT_FOCUS_RING, formatDayLabel, type ChatAction } from './ChatParts';
import { startVisiblePoll } from '@/lib/visible-poll';

// An open thread checks for new messages every 5 s while the tab is in use, every 30 s once idle.
const POLL_MS = 5000;
const IDLE_POLL_MS = 30_000;

type ThreadMessage = ChatMessage & { pending?: boolean };

/** Add new messages and replace edited/deleted ones, keeping send order. */
function mergeMessages(current: ThreadMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (existing && existing.updatedAt === m.updatedAt) continue;
    byId.set(m.id, m);
    changed = true;
  }
  if (!changed) return current;
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Latest change seen, so polling picks up new messages as well as edits and deletes. */
function pollCursor(messages: ThreadMessage[]) {
  let latest: string | null = null;
  for (const m of messages) {
    if (!m.pending && (!latest || m.updatedAt > latest)) latest = m.updatedAt;
  }
  return latest;
}

function MessageActions({
  message,
  mine,
  onCopy,
  onEdit,
  onDelete,
  onOpenChange,
}: {
  message: ThreadMessage;
  mine: boolean;
  onCopy: (m: ThreadMessage) => void;
  onEdit: (m: ThreadMessage) => void;
  onDelete: (m: ThreadMessage) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const actions: ChatAction[] = [];
  if (!message.deleted) actions.push({ label: 'Copy text', icon: ACTION_ICONS.copy, onSelect: () => onCopy(message) });
  if (mine && canEditMessage(message)) actions.push({ label: 'Edit', icon: ACTION_ICONS.edit, onSelect: () => onEdit(message) });
  actions.push({ label: 'Delete', icon: ACTION_ICONS.trash, danger: true, onSelect: () => onDelete(message) });
  return (
    <ActionMenu
      label="Message actions"
      align={mine ? 'end' : 'start'}
      actions={actions}
      onOpenChange={onOpenChange}
      triggerClassName="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
    />
  );
}

/** Message history + composer for one conversation. Used by the floating dock and the Messages page. */
export default function ChatThread({
  conversation,
  compact = false,
}: {
  conversation: ConversationSummary;
  compact?: boolean;
}) {
  const { meId, markRead, releaseUnread, noteSent, noteChanged } = useMessaging();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Message being edited in the composer, with the draft that was there before
  const [editing, setEditing] = useState<{ message: ThreadMessage; previousDraft: string } | null>(null);
  const [deleting, setDeleting] = useState<ThreadMessage | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  // Opening the thread again lifts a "mark as unread" hold. Declared before the read effects.
  useEffect(() => {
    releaseUnread(conversationId);
  }, [conversationId, releaseUnread]);

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

  // Poll for new, edited and deleted messages while the tab is visible
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const cursor = pollCursor(messagesRef.current);
      const url = cursor ? `${base}?after=${encodeURIComponent(cursor)}` : base;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled || !data.success) return;
        // An edit to a message older than the loaded page isn't ours to show yet
        const oldest = messagesRef.current.find((m) => !m.pending)?.createdAt;
        const known = new Set(messagesRef.current.map((m) => m.id));
        const incoming = (data.data.messages as ChatMessage[]).filter(
          (m) => known.has(m.id) || !oldest || m.createdAt >= oldest
        );
        const el = scrollRef.current;
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        setMessages((prev) => mergeMessages(prev, incoming));
      } catch {
        // transient; next tick retries
      }
    };
    const stopPolling = startVisiblePoll(() => void poll(), { activeMs: POLL_MS, idleMs: IDLE_POLL_MS });
    return () => {
      cancelled = true;
      stopPolling();
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

  const replaceMessage = (message: ChatMessage) => {
    stickToBottom.current = false;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
  };

  const startEdit = (message: ThreadMessage) => {
    setError(null);
    setEditing({ message, previousDraft: editing ? editing.previousDraft : draft });
    setDraft(message.body);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  };

  const cancelEdit = useCallback(() => {
    if (!editing) return;
    setDraft(editing.previousDraft);
    setEditing(null);
    setError(null);
    textareaRef.current?.focus();
  }, [editing]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const body = draft.trim();
    const original = editing.message;
    if (!body) return;
    if (body === original.body) {
      cancelEdit();
      return;
    }
    setError(null);
    setDraft(editing.previousDraft);
    setEditing(null);
    replaceMessage({ ...original, body, editedAt: new Date().toISOString() });
    try {
      const res = await fetch(`${base}/${original.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      replaceMessage(data.data);
      noteChanged(conversationId, data.data);
    } catch (err: any) {
      replaceMessage(original);
      setError(err?.message || 'Could not save your edit. Try again.');
    }
    textareaRef.current?.focus();
  }, [editing, draft, base, conversationId, noteChanged, cancelEdit]);

  const deleteMessage = async (message: ThreadMessage, forEveryone: boolean) => {
    setDeleting(null);
    setError(null);
    if (editing?.message.id === message.id) cancelEdit();
    if (forEveryone) {
      replaceMessage({ ...message, body: '', editedAt: null, deleted: true });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
    try {
      const res = await fetch(`${base}/${message.id}${forEveryone ? '?for=everyone' : ''}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (forEveryone) {
        replaceMessage(data.data);
        noteChanged(conversationId, data.data);
      }
    } catch (err: any) {
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== message.id), [message]));
      setError(err?.message || 'Could not delete the message. Try again.');
    }
  };

  const copyMessage = async (message: ThreadMessage) => {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  };

  const send = useCallback(async () => {
    if (editing) {
      saveEdit();
      return;
    }
    const body = draft.trim();
    if (!body || !meId) return;
    const tempId = `pending-${Date.now()}`;
    const now = new Date().toISOString();
    stickToBottom.current = true;
    setError(null);
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { id: tempId, senderId: meId, body, createdAt: now, updatedAt: now, editedAt: null, deleted: false, pending: true },
    ]);
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
  }, [editing, saveEdit, draft, meId, base, conversationId, noteSent]);

  // Grow the composer with its content, up to a cap
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, compact ? 96 : 160)}px`;
  }, [draft, compact]);

  const firstName = conversation.other.name.split(' ')[0];

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
            <p className="text-sm font-medium text-gray-900">Say hello to {firstName}</p>
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
                const beingEdited = editing?.message.id === m.id;
                const showMeta = !grouped || i === messages.length - 1 || Boolean(m.editedAt) || copiedId === m.id;
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
                    <li className={`group flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-1.5'}`}>
                      <div className={`max-w-[80%] flex items-center gap-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`min-w-0 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                          {m.deleted ? (
                            <div className="px-3 py-2 text-sm italic text-gray-400 rounded-2xl border border-dashed border-gray-200">
                              {mine ? 'You deleted this message' : 'This message was deleted'}
                            </div>
                          ) : (
                            <div
                              className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-2xl ${
                                mine
                                  ? 'bg-brand-teal-dark text-white rounded-br-md'
                                  : 'bg-gray-100 text-gray-900 rounded-bl-md'
                              } ${m.pending ? 'opacity-60' : ''} ${beingEdited ? 'ring-2 ring-brand-teal ring-offset-2' : ''}`}
                            >
                              {m.body}
                            </div>
                          )}
                          {showMeta && (
                            <span className="mt-0.5 px-1 text-[11px] text-gray-400 tabular-nums" aria-live={copiedId === m.id ? 'polite' : undefined}>
                              {m.pending
                                ? 'Sending…'
                                : copiedId === m.id
                                  ? 'Copied'
                                  : `${format(new Date(m.createdAt), 'h:mm a')}${m.editedAt ? ' · Edited' : ''}`}
                            </span>
                          )}
                        </div>
                        {!m.pending && (
                          <div
                            className={`shrink-0 self-start mt-1 transition-opacity ${
                              menuOpenId === m.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'
                            }`}
                          >
                            <MessageActions
                              message={m}
                              mine={mine}
                              onCopy={copyMessage}
                              onEdit={startEdit}
                              onDelete={setDeleting}
                              onOpenChange={(open) => setMenuOpenId(open ? m.id : null)}
                            />
                          </div>
                        )}
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
        {editing && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-brand-teal-light/60 pl-3 pr-1 py-1">
            <span className="w-3.5 h-3.5 shrink-0 text-brand-teal-dark" aria-hidden="true">{ACTION_ICONS.edit}</span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-semibold text-brand-teal-dark">Editing message</span>
              <span className="block truncate text-gray-500">{editing.message.body}</span>
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel editing"
              title="Cancel editing (Esc)"
              className={`p-1 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white/70 ${CHAT_FOCUS_RING}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && editing) {
                e.preventDefault();
                cancelEdit();
              } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={editing ? 'Edit your message…' : 'Write a message…'}
            aria-label={editing ? 'Edit message' : `Message ${conversation.other.name}`}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={editing ? 'Save edit' : 'Send message'}
            className="h-9 w-9 shrink-0 rounded-lg bg-brand-teal-dark text-white flex items-center justify-center transition-colors hover:bg-brand-teal-deep disabled:bg-gray-200 disabled:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={editing ? 'M5 13l4 4L19 7' : 'M12 19V5m0 0l-6 6m6-6l6 6'}
              />
            </svg>
          </button>
        </div>
        {!compact && (
          <p className="mt-1.5 px-1 text-[11px] text-gray-400">
            {editing ? 'Enter to save · Esc to cancel' : 'Enter to send · Shift + Enter for a new line'}
          </p>
        )}
      </form>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete message?"
        description={
          deleting && deleting.senderId === meId && !deleting.deleted
            ? `Delete for everyone removes it for you and ${firstName}. Delete for me removes it only from your view.`
            : 'This removes the message from your view only.'
        }
      >
        <button
          type="button"
          onClick={() => setDeleting(null)}
          className={`px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 ${CHAT_FOCUS_RING}`}
        >
          Cancel
        </button>
        {deleting && (
          <button
            type="button"
            onClick={() => deleteMessage(deleting, false)}
            className={`px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-800 hover:bg-gray-50 ${CHAT_FOCUS_RING}`}
          >
            Delete for me
          </button>
        )}
        {deleting && deleting.senderId === meId && !deleting.deleted && (
          <button
            type="button"
            onClick={() => deleteMessage(deleting, true)}
            className={`px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 ${CHAT_FOCUS_RING}`}
          >
            Delete for everyone
          </button>
        )}
      </AlertDialog>
    </div>
  );
}
