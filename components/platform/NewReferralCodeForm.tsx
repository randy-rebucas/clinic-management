'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD } from '../appointments/shared';
import { LABEL, Notice, PRIMARY, callPlatform } from './platform-api';

/** Make a custom referral code (and signup link) for a medical rep, e.g. for an event or campaign. */
export default function NewReferralCodeForm({ reps }: { reps: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [repId, setRepId] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!repId) return;
    setBusy(true);
    setNotice(null);
    const r = await callPlatform<{ id: string; code: string }>('/api/platform/referral-codes', 'POST', {
      repId,
      code: code.trim() || undefined,
      label: label.trim() || undefined,
      maxUses: maxUses ? Number(maxUses) : undefined,
      expiresOn: expiresOn || undefined,
    });
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    setNotice({ tone: 'ok', text: `Made ${r.data.code}. Copy its link from the list.` });
    setCode('');
    setLabel('');
    setMaxUses('');
    setExpiresOn('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="rc-rep" className={LABEL}>Representative</label>
        <select id="rc-rep" required value={repId} onChange={(e) => setRepId(e.target.value)} className={FIELD}>
          <option value="">{reps.length ? 'Choose a rep…' : 'No active reps yet'}</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Only activated reps are listed.</p>
      </div>
      <div>
        <label htmlFor="rc-code" className={LABEL}>Code (optional)</label>
        <input
          id="rc-code"
          value={code}
          maxLength={24}
          spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
          className={`${FIELD} font-mono uppercase`}
          placeholder="PMA2026"
        />
        <p className="mt-1 text-xs text-gray-500">4–24 letters, digits or hyphens. Blank makes a random one.</p>
      </div>
      <div>
        <label htmlFor="rc-label" className={LABEL}>Note (optional)</label>
        <input id="rc-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} className={FIELD} placeholder="PMA convention, Nov 2026" />
        <p className="mt-1 text-xs text-gray-500">Only shown here.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="rc-max" className={LABEL}>Clinic limit</label>
          <input id="rc-max" type="number" min={1} max={100000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={FIELD} placeholder="No limit" />
        </div>
        <div>
          <label htmlFor="rc-exp" className={LABEL}>Last day</label>
          <input id="rc-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={FIELD} />
        </div>
      </div>
      <button type="submit" disabled={busy || !repId} className={PRIMARY}>{busy ? 'Making…' : 'Make code'}</button>
      <Notice notice={notice} />
    </form>
  );
}
