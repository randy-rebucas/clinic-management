'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { callPlatform, Notice, OUTLINE, PRIMARY, LABEL } from './platform-api';
import { startVisiblePoll } from '@/lib/visible-poll';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';
import type { SupportChatMessage, SupportChatPerson } from '@/lib/support-chat';

/** The platform console's support chat: find a staff member, the thread, and broadcasts. */

// ── Find someone to message ─────────────────────────────────────────────────────

export function StaffPicker() {
  const router = useRouter();
  const [q, setQ] = useState('');
  // Results with the text they answer, so a stale answer never shows under newer text.
  const [found, setFound] = useState<{ term: string; people: SupportChatPerson[] } | null>(null);
  const term = q.trim();
  const results = found && found.term === term ? found.people : null;

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/platform/chat/staff?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const json = await res.json();
        if (json?.success) setFound({ term, people: json.data });
      } catch {
        // Aborted by the next keystroke, or offline: the list keeps what it had.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return (
    <div className="relative">
      <label htmlFor="staff-search" className={LABEL}>Message a staff member</label>
      <input
        id="staff-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or email, in any clinic"
        autoComplete="off"
        className={FIELD}
      />
      {results && term.length >= 2 && (
        <ul className="absolute inset-x-0 z-10 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                onClick={() => router.push(`/platform/chat/${p.userId}`)}
                className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${FOCUS_RING}`}
              >
                <span className="block text-sm font-medium text-gray-900">{p.name}</span>
                <span className="block truncate text-xs text-gray-500">
                  {p.clinic.name}{p.role ? ` · ${p.role}` : ''} · {p.email}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No active staff member matches.</li>}
        </ul>
      )}
    </div>
  );
}

// ── One thread ─────────────────────────────────────────────────────────────────

const POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export function SupportChatThread({
  person,
  initial,
  hasOlder,
}: {
  person: SupportChatPerson;
  initial: SupportChatMessage[];
  hasOlder: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = messages.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  // New replies, edits and deletions arrive while the conversation is on screen.
  useEffect(
    () =>
      startVisiblePoll(async () => {
        const result = await callPlatform<{ messages: SupportChatMessage[] }>(`/api/platform/chat/${person.userId}`, 'GET');
        if (result.ok) setMessages(result.data.messages);
      }, { activeMs: POLL_MS, idleMs: IDLE_POLL_MS }),
    [person.userId]
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setNotice(null);
    const result = await callPlatform<SupportChatMessage>(`/api/platform/chat/${person.userId}`, 'POST', { body });
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    setMessages((prev) => [...prev, result.data]);
    setText('');
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3" aria-label={`Conversation with ${person.name}`}>
        {hasOlder && <li className="text-center text-xs text-gray-500">Older messages aren’t shown.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.fromSupport ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-4 py-3 ${m.fromSupport ? 'bg-brand-teal-light' : 'border border-gray-200 bg-white'}`}>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{m.fromSupport ? `MyClinicSoft · ${m.agentEmail ?? 'support'}` : person.name}</span>
                {' · '}
                {when(m.createdAt)}
                {m.edited && ' · edited'}
              </p>
              {m.deleted ? (
                <p className="mt-1.5 text-sm italic text-gray-500">Deleted by {person.name}</p>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-gray-900">{m.body}</p>
              )}
            </div>
          </li>
        ))}
        {messages.length === 0 && (
          <li className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
            No messages yet. What you send appears in {person.name.split(' ')[0]}’s Messages as from MyClinicSoft Support.
          </li>
        )}
      </ol>
      <div ref={endRef} />

      <form onSubmit={send} className="rounded-lg border border-gray-200 bg-white p-4">
        <label htmlFor="support-reply" className="text-sm font-medium text-gray-700">Message</label>
        <textarea
          id="support-reply"
          rows={4}
          value={text}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          disabled={!person.active}
          className={`${FIELD} mt-1.5`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !text.trim() || !person.active} className={PRIMARY}>
            {busy ? 'Sending…' : 'Send'}
          </button>
          <Notice notice={notice} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {person.active
            ? 'They get it in Messages and as a push notification on their devices. Ctrl+Enter sends.'
            : 'This account is inactive, so they can’t read new messages.'}
        </p>
      </form>
    </div>
  );
}

// ── Broadcast ──────────────────────────────────────────────────────────────────

export function SupportBroadcastForm({ clinic }: { clinic?: { id: string; name: string } }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'admins' | 'all-staff'>('admins');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const who = audience === 'admins' ? 'the admins' : 'all staff';
    const where = clinic ? clinic.name : 'every active clinic';
    if (!window.confirm(`Send this message to ${who} of ${where}? Each of them gets it in their support conversation.`)) return;
    setBusy(true);
    setNotice(null);
    const result = await callPlatform<{ clinics: number; recipients: number }>('/api/platform/chat/broadcast', 'POST', {
      body: body.trim(),
      audience,
      tenantIds: clinic ? [clinic.id] : [],
    });
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.error });
      return;
    }
    const { recipients, clinics } = result.data;
    setNotice({ tone: 'ok', text: `Sent to ${recipients} ${recipients === 1 ? 'person' : 'people'} in ${clinics} ${clinics === 1 ? 'clinic' : 'clinics'}.` });
    setBody('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="bc-body" className={LABEL}>Message</label>
        <textarea id="bc-body" required rows={6} maxLength={MESSAGE_MAX_LENGTH} value={body} onChange={(e) => setBody(e.target.value)} className={FIELD} />
      </div>
      <div className="max-w-xs">
        <label htmlFor="bc-audience" className={LABEL}>Who</label>
        <select id="bc-audience" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className={FIELD}>
          <option value="admins">Clinic admins</option>
          <option value="all-staff">All clinic staff</option>
        </select>
      </div>
      <p className="text-xs text-gray-500">
        It lands in each person’s conversation with MyClinicSoft Support, in the app only (no push), and they can reply there.
        Replies show up in Support chat like any other.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !body.trim()} className={PRIMARY}>
          {busy ? 'Sending…' : clinic ? `Send to ${clinic.name}` : 'Send to every clinic'}
        </button>
        {clinic && (
          <button type="button" onClick={() => router.push('/platform/chat/broadcast')} className={OUTLINE}>
            Every clinic instead
          </button>
        )}
        <Notice notice={notice} />
      </div>
    </form>
  );
}
