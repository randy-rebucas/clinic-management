'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
        <label htmlFor="ann-title" className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
        <input id="ann-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor="ann-message" className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
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
      <p className="text-xs text-gray-500">
        It appears in each recipient&rsquo;s notifications as from MyClinicSoft. Important and urgent ones, and anything sent only to admins, also go to their phones and browsers.
      </p>
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !title.trim() || !message.trim()}
        className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      >
        {busy ? 'Sending…' : clinic ? `Send to ${clinic.name}` : 'Send to every clinic'}
      </button>
    </form>
  );
}
