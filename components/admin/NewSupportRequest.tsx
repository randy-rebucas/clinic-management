'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { useSend } from './users-shared';

const CATEGORIES = [
  ['general', 'General question'],
  ['technical', 'Something is not working'],
  ['billing', 'Billing or subscription'],
  ['account', 'Accounts and sign-in'],
  ['onboarding', 'Getting set up'],
  ['other', 'Other'],
] as const;

export default function NewSupportRequest() {
  const router = useRouter();
  const send = useSend('Your request was not sent');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await send('/api/support', 'POST', { subject, category, message });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(`/admin/support/${(r.data as { id: string }).id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <label htmlFor="s-subject" className="mb-1.5 block text-sm font-medium text-gray-700">Subject</label>
          <input id="s-subject" required minLength={3} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor="s-category" className="mb-1.5 block text-sm font-medium text-gray-700">About</label>
          <select id="s-category" value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="s-message" className="mb-1.5 block text-sm font-medium text-gray-700">What happened?</label>
        <textarea id="s-message" required minLength={10} maxLength={10000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className={FIELD} />
        <p className="mt-1 text-xs text-gray-500">Say what you were doing and what you expected. Don&rsquo;t include patient details.</p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}>
        {busy ? 'Sending…' : 'Send to MyClinicSoft support'}
      </button>
    </form>
  );
}
