'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD } from '../appointments/shared';
import { php } from './shared';
import { LABEL, Notice, PRIMARY, callPlatform } from './platform-api';

/**
 * Make a batch of eMCR voucher codes for a clinic. The batch starts unpaid: it can be printed,
 * but the codes only work once the cash is recorded on the batch's page.
 */
export default function NewVoucherBatchForm({ clinics }: { clinics: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [quantity, setQuantity] = useState(50);
  const [faceValue, setFaceValue] = useState(80);
  const [wholesalePrice, setWholesalePrice] = useState(60);
  const [days, setDays] = useState(365);
  const [plan, setPlan] = useState<'basic' | 'plus'>('basic');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const clinic = clinics.find((c) => c.id === tenantId);
  const valid = !!clinic && quantity >= 1 && quantity <= 1000 && wholesalePrice <= faceValue && days >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    if (!window.confirm(`Make ${quantity} vouchers for ${clinic.name}? ${php(quantity * wholesalePrice)} will be due from the clinic.`)) return;
    setBusy(true);
    setNotice(null);
    const r = await callPlatform<{ id: string; batchNumber: string }>('/api/platform/vouchers', 'POST', {
      tenantId,
      quantity,
      plan,
      faceValue,
      wholesalePrice,
      days,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    router.push(`/platform/vouchers/${r.data.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="vb-clinic" className={LABEL}>Clinic</label>
        <select id="vb-clinic" required value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={FIELD}>
          <option value="">Choose a clinic…</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="vb-qty" className={LABEL}>Vouchers</label>
          <input id="vb-qty" type="number" required min={1} max={1000} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={FIELD} />
        </div>
        <div>
          <label htmlFor="vb-plan" className={LABEL}>Plan</label>
          <select id="vb-plan" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className={FIELD}>
            <option value="basic">Basic</option>
            <option value="plus">Plus</option>
          </select>
        </div>
        <div>
          <label htmlFor="vb-face" className={LABEL}>Patient price (₱)</label>
          <input id="vb-face" type="number" required min={0} step="any" value={faceValue} onChange={(e) => setFaceValue(Number(e.target.value))} className={FIELD} />
        </div>
        <div>
          <label htmlFor="vb-wholesale" className={LABEL}>Clinic pays (₱)</label>
          <input id="vb-wholesale" type="number" required min={0} step="any" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} className={FIELD} />
        </div>
        <div>
          <label htmlFor="vb-days" className={LABEL}>Days per code</label>
          <input id="vb-days" type="number" required min={1} max={1098} value={days} onChange={(e) => setDays(Number(e.target.value))} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="vb-notes" className={LABEL}>Notes <span className="font-normal text-gray-500">(optional)</span></label>
        <input id="vb-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD} />
      </div>
      {wholesalePrice > faceValue && <p className="text-sm text-rose-700">The clinic&rsquo;s price can&rsquo;t be above the patient price.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Due from the clinic: <span className="font-semibold tabular-nums text-gray-900">{php(Math.max(0, quantity) * wholesalePrice)}</span>
        </p>
        <button type="submit" disabled={busy || !valid} className={`${PRIMARY} disabled:cursor-not-allowed`}>
          {busy ? 'Making…' : 'Make batch'}
        </button>
      </div>
      <Notice notice={notice} />
    </form>
  );
}
