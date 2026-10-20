'use client';

import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, Svg } from '../appointments/shared';

const CHAT = 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z';
import { formatApiError } from '../utils/apiError';

type Sent = { id: string; title: string; message: string; from: string | null; createdAt: string };

/**
 * A doctor or admin sends the patient a message: it appears in the patient app's notifications
 * from them, by name, and is pushed to the patient's phone. Shows what was sent before.
 */
export default function MessagePatientButton({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<Sent[] | null>(null);

  async function loadHistory() {
    try {
      const res = await fetch(`/api/patients/${patientId}/messages`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) setHistory(json.data);
    } catch {
      // the history is a convenience; sending still works
    }
  }

  function show() {
    setOpen(true);
    setNotice(null);
    void loadHistory();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ tone: 'error', text: formatApiError(json, 'The message was not sent') });
        return;
      }
      setNotice({ tone: 'ok', text: `Sent. ${patientName} will see it in the patient app.` });
      setTitle('');
      setMessage('');
      void loadHistory();
    } catch {
      setNotice({ tone: 'error', text: 'The server couldn’t be reached. Nothing was sent.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
      >
        <Svg d={CHAT} />
        Message patient
      </button>
      <Modal open={open} onOpenChange={setOpen} labelledBy="message-patient-title" className="max-w-lg">
        <form onSubmit={send} className="space-y-4 p-6">
          <div>
            <h2 id="message-patient-title" className="text-lg font-semibold text-gray-900">Message {patientName}</h2>
            <p className="mt-1 text-sm text-gray-600">Appears in the patient app&rsquo;s notifications, from you, and on their phone. Don&rsquo;t send anything they couldn&rsquo;t read aloud in a waiting room.</p>
          </div>
          <div>
            <label htmlFor="pm-title" className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
            <input id="pm-title" required maxLength={120} placeholder="About your follow-up" value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="pm-message" className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
            <textarea id="pm-message" required maxLength={2000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={FIELD} />
          </div>
          {notice && (
            <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
              {notice.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Close
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !message.trim()}
              className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
          {history && history.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-xs font-medium text-gray-500">Sent before</h3>
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium text-gray-900">{h.title}</p>
                    <p className="whitespace-pre-wrap text-gray-600">{h.message}</p>
                    <p className="text-xs text-gray-500">
                      {h.from ?? 'Clinic'} · {new Date(h.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
