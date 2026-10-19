'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { SUPPORT_STATUS_LABEL } from './shared';
import type { SupportStatus, SupportReplyAuthor } from '@/models/SupportRequest';

export interface ThreadMessage {
  id: string;
  authorType: SupportReplyAuthor;
  authorEmail: string;
  message: string;
  createdAt: string;
}

const STATUSES: SupportStatus[] = ['open', 'in-progress', 'resolved', 'closed'];
const BTN = `rounded-md px-3 py-1.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

/**
 * A support request's conversation and reply box. The platform console and the clinic's
 * admin area both use it; `side` is who is reading, which decides whose bubbles sit right.
 */
export default function SupportThread({
  side,
  thread,
  status,
  replyUrl,
  statusUrl,
}: {
  side: SupportReplyAuthor;
  thread: ThreadMessage[];
  status: SupportStatus;
  replyUrl: string;
  /** Platform only: lets the reader change the status. */
  statusUrl?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'That didn’t go through'));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('The server couldn’t be reached. Nothing was sent.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const reply = async (nextStatus?: SupportStatus) => {
    if (!text.trim()) return;
    if (await send(replyUrl, 'POST', { message: text.trim(), ...(nextStatus ? { status: nextStatus } : {}) })) setText('');
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {thread.map((m) => {
          const mine = m.authorType === side;
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-3 ${mine ? 'bg-brand-teal-light' : 'border border-gray-200 bg-white'}`}>
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{m.authorType === 'platform' ? `MyClinicSoft · ${m.authorEmail}` : m.authorEmail}</span>
                  {' · '}
                  {new Date(m.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-gray-900">{m.message}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label htmlFor="reply" className="text-sm font-medium text-gray-700">Reply</label>
        <textarea id="reply" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={10000} className={`${FIELD} mt-1.5`} />
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !text.trim()} onClick={() => reply()} className={`${BTN} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`}>
            {busy ? 'Sending…' : 'Send reply'}
          </button>
          {statusUrl && (
            <button type="button" disabled={busy || !text.trim()} onClick={() => reply('resolved')} className={`${BTN} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`}>
              Send and resolve
            </button>
          )}
          {statusUrl && (
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              Status
              <select value={status} disabled={busy} onChange={(e) => send(statusUrl, 'PATCH', { status: e.target.value })} className={`${FIELD} w-auto`}>
                {STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {side === 'platform' ? 'The requester gets your reply by email.' : 'The MyClinicSoft team is emailed when you reply.'}
        </p>
      </div>
    </div>
  );
}
