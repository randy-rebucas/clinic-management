'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, ExternalLink, Inbox, Megaphone, Send, Smartphone } from 'lucide-react';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING } from '../appointments/shared';

/**
 * Compose a notification from the platform team to clinics. `clinic` narrows it to one clinic
 * (opened from a clinic's page); otherwise it goes to every active clinic.
 */
export default function AnnouncementForm({ clinic }: { clinic?: { id: string; name: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'admins' | 'all-staff'>('admins');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [actionUrl, setActionUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Same rule as POST /api/platform/notifications.
  const pushed = priority !== 'normal' || audience === 'admins';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const where = clinic ? clinic.name : 'every active clinic';
    if (!window.confirm(`Send “${title}” to ${audience === 'admins' ? 'the admins' : 'all staff'} of ${where}?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, audience, priority, tenantIds: clinic ? [clinic.id] : [], actionUrl: actionUrl.trim() || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNotice({ tone: 'error', text: formatApiError(json, 'The notification was not sent') });
        return;
      }
      setNotice({ tone: 'ok', text: `Sent to ${json.data.recipients} ${json.data.recipients === 1 ? 'person' : 'people'} in ${json.data.clinics} ${json.data.clinics === 1 ? 'clinic' : 'clinics'}.` });
      setTitle('');
      setMessage('');
      setActionUrl('');
      router.refresh();
    } catch {
      setNotice({ tone: 'error', text: 'The server couldn’t be reached. Nothing was sent.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="ann-title" className="block text-sm font-medium text-gray-700">Title</label>
          <span className="text-xs tabular-nums text-gray-400">{title.length}/200</span>
        </div>
        <input id="ann-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="ann-message" className="block text-sm font-medium text-gray-700">Message</label>
          <span className="text-xs tabular-nums text-gray-400">{message.length}/2000</span>
        </div>
        <textarea id="ann-message" required maxLength={2000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className={FIELD} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="ann-audience" className="mb-1.5 block text-sm font-medium text-gray-700">Who</label>
          <select id="ann-audience" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className={FIELD}>
            <option value="admins">Clinic admins</option>
            <option value="all-staff">All clinic staff</option>
          </select>
        </div>
        <div>
          <label htmlFor="ann-priority" className="mb-1.5 block text-sm font-medium text-gray-700">Importance</label>
          <select id="ann-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={FIELD}>
            <option value="normal">Normal</option>
            <option value="high">Important</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label htmlFor="ann-link" className="mb-1.5 block text-sm font-medium text-gray-700">Link <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="ann-link" placeholder="/admin/subscription" maxLength={500} value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} className={FIELD} />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-500">Preview</p>
        <div className="mt-2 flex gap-3 rounded-md border border-gray-200 bg-white p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-deep">
            <Megaphone aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{title.trim() || 'Your title'}</span>
              {priority !== 'normal' && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${priority === 'urgent' ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
                  {priority === 'urgent' ? 'Urgent' : 'Important'}
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600">{message.trim() || 'Your message appears here.'}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              From MyClinicSoft
              {actionUrl.trim() && (
                <>
                  {' · '}
                  <ExternalLink aria-hidden="true" className="size-3" /> {actionUrl.trim()}
                </>
              )}
            </p>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1"><Inbox aria-hidden="true" className="size-3.5" /> In their notifications</span>
          {pushed ? (
            <span className="inline-flex items-center gap-1 font-medium text-brand-teal-deep"><Smartphone aria-hidden="true" className="size-3.5" /> Also pushed to phones and browsers</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-gray-500"><BellRing aria-hidden="true" className="size-3.5" /> No push: normal notes to all staff stay in the app</span>
          )}
        </p>
      </div>
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !title.trim() || !message.trim()}
        className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      >
        <Send aria-hidden="true" className="size-4" />
        {busy ? 'Sending…' : clinic ? `Send to ${clinic.name}` : 'Send to every clinic'}
      </button>
    </form>
  );
}
