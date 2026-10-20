'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { formatApiError } from '../utils/apiError';

type Recipients = { staff: Array<{ id: string; name: string; role: string | null; roleLabel: string | null }>; roles: Array<{ name: string; label: string }> };
type Mode = 'people' | 'roles' | 'all';

/** Doctors and admins notify colleagues: chosen people, whole roles, or all staff. */
export default function SendNotificationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [list, setList] = useState<Recipients | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('people');
  const [people, setPeople] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!open || list) return;
    fetch('/api/notifications/recipients')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => (ok && j?.success ? setList(j.data) : setLoadError(formatApiError(j, 'The staff list didn’t load'))))
      .catch(() => setLoadError('The staff list didn’t load'));
  }, [open, list]);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chosen = mode === 'all' || (mode === 'people' ? people.length > 0 : roles.length > 0);
  const shown = (list?.staff ?? []).filter((s) => !filter.trim() || s.name.toLowerCase().includes(filter.trim().toLowerCase()));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          priority: important ? 'high' : 'normal',
          ...(mode === 'all' ? { allStaff: true } : mode === 'people' ? { userIds: people } : { roles }),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ tone: 'error', text: formatApiError(json, 'The notification was not sent') });
        return;
      }
      setNotice({ tone: 'ok', text: `Sent to ${json.data.recipients} ${json.data.recipients === 1 ? 'person' : 'people'}.` });
      setTitle('');
      setMessage('');
      setPeople([]);
      setRoles([]);
      setImportant(false);
    } catch {
      setNotice({ tone: 'error', text: 'The server couldn’t be reached. Nothing was sent.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} labelledBy="send-notification-title" className="max-w-xl">
      <form onSubmit={send} className="space-y-4 p-6">
        <h2 id="send-notification-title" className="text-lg font-semibold text-gray-900">Send a notification</h2>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-gray-700">To</legend>
          <div role="radiogroup" className="inline-flex rounded-md border border-gray-200 bg-white p-1">
            {(
              [
                ['people', 'Chosen people'],
                ['roles', 'Roles'],
                ['all', 'All staff'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={mode === v}
                onClick={() => setMode(v)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${FOCUS_RING} ${mode === v ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {loadError && <p role="alert" className="mt-2 text-sm text-rose-700">{loadError}</p>}
          {mode === 'people' && list && (
            <div className="mt-2">
              <label htmlFor="staff-filter" className="sr-only">Find a colleague</label>
              <input id="staff-filter" placeholder="Find a colleague" value={filter} onChange={(e) => setFilter(e.target.value)} className={FIELD} />
              <ul className="mt-2 max-h-44 overflow-y-auto rounded-md border border-gray-200">
                {shown.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={people.includes(s.id)} onChange={() => setPeople(toggle(people, s.id))} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
                      <span className="text-gray-900">{s.name}</span>
                      {s.roleLabel && <span className="text-xs text-gray-500">{s.roleLabel}</span>}
                    </label>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No one matches.</li>}
              </ul>
            </div>
          )}
          {mode === 'roles' && list && (
            <div className="mt-2 flex flex-wrap gap-3">
              {list.roles.map((r) => (
                <label key={r.name} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={roles.includes(r.name)} onChange={() => setRoles(toggle(roles, r.name))} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
                  {r.label}
                </label>
              ))}
            </div>
          )}
          {mode === 'all' && <p className="mt-2 text-sm text-gray-600">Everyone on the clinic&rsquo;s staff except you.</p>}
        </fieldset>

        <div>
          <label htmlFor="n-title" className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
          <input id="n-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor="n-message" className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
          <textarea id="n-message" required maxLength={2000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={FIELD} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
          Mark as important
        </label>
        <p className="text-xs text-gray-500">Recipients see it&rsquo;s from you, in their notifications and on their phones and browsers.</p>

        {notice && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
            {notice.text}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            Close
          </button>
          <button
            type="submit"
            disabled={busy || !chosen || !title.trim() || !message.trim()}
            className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
