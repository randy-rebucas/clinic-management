'use client';

import { useState } from 'react';
import { FIELD } from '../appointments/shared';
import { day } from './shared';
import { LABEL, Notice, OUTLINE, PRIMARY, callPlatform } from './platform-api';

interface Activation {
  active: boolean;
  plan: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  enforced: boolean;
}

interface EmcrAccountView {
  id: string;
  phone: string;
  holder: string | null;
  dependents: number;
  activation: Activation;
  history: Array<{ source: string; plan: string; days: number; at: string; expiresAt: string; by: string | null; ref: string | null }>;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = { code: 'Voucher', manual: 'By hand' };

/** Support: find an eMCR account by its mobile number, see its activation, grant days by hand. */
export default function EmcrAccountLookup() {
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const [account, setAccount] = useState<EmcrAccountView | null>(null);
  const [busy, setBusy] = useState<'search' | 'grant' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [days, setDays] = useState(365);
  const [plan, setPlan] = useState<'basic' | 'plus'>('basic');
  const [reason, setReason] = useState('');

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = phone.trim();
    if (!q) return;
    setBusy('search');
    setNotice(null);
    const r = await callPlatform<EmcrAccountView | null>(`/api/platform/emcr-accounts?${new URLSearchParams({ phone: q })}`, 'GET');
    setBusy(null);
    if (!r.ok) {
      setAccount(null);
      setSearched(null);
      return setNotice({ tone: 'error', text: r.error });
    }
    setAccount(r.data);
    setSearched(q);
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    if (!window.confirm(`Give ${account.phone} ${days} days of eMCR ${plan === 'plus' ? 'Plus' : 'Basic'}? It is written to the audit log.`)) return;
    setBusy('grant');
    setNotice(null);
    const r = await callPlatform<{ activation: Activation }>('/api/platform/emcr-accounts', 'POST', { accountId: account.id, days, plan, reason: reason.trim() });
    setBusy(null);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    setReason('');
    setNotice({ tone: 'ok', text: `Granted ${days} days. Active until ${day(r.data.activation.expiresAt)}.` });
    await search();
  }

  const a = account?.activation;

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="emcr-phone" className={LABEL}>Mobile number</label>
          <input id="emcr-phone" type="tel" inputMode="tel" placeholder="09171234567" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} />
        </div>
        <button type="submit" disabled={busy !== null || !phone.trim()} className={OUTLINE}>
          {busy === 'search' ? 'Looking…' : 'Look up'}
        </button>
      </form>

      {searched && !account && <p className="text-sm text-gray-600">No eMCR account uses {searched}.</p>}

      {account && a && (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-gray-500">Account</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{account.holder || 'No profile yet'}</dd>
              <dd className="font-mono text-xs text-gray-500">{account.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Activation</dt>
              <dd className={`mt-0.5 text-sm font-semibold ${a.active ? 'text-emerald-700' : 'text-gray-700'}`}>
                {a.active ? `Active, ${a.plan === 'plus' ? 'Plus' : 'Basic'}` : 'Not active'}
              </dd>
              {!a.enforced && <dd className="text-xs text-gray-500">Not enforced yet</dd>}
            </div>
            <div>
              <dt className="text-xs text-gray-500">Expires</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{day(a.expiresAt)}{a.active ? ` (${a.daysLeft} d left)` : ''}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Family profiles</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-gray-900">{account.dependents}</dd>
              <dd className="text-xs text-gray-500">since {day(account.createdAt)}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-xs font-medium text-gray-500">History</h3>
            {account.history.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {[...account.history].reverse().map((h, i) => (
                      <tr key={`${h.at}-${i}`}>
                        <td className="py-2 text-gray-700">{day(h.at)}</td>
                        <td className="py-2 text-gray-700">{SOURCE_LABEL[h.source] ?? h.source}, {h.plan === 'plus' ? 'Plus' : 'Basic'}</td>
                        <td className="py-2 tabular-nums text-gray-700">+{h.days} d</td>
                        <td className="py-2 text-gray-500">to {day(h.expiresAt)}</td>
                        <td className="py-2 text-xs text-gray-500">{[h.by, h.ref].filter(Boolean).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Never activated.</p>
            )}
          </div>

          <form onSubmit={grant} className="space-y-3 rounded-md bg-gray-50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Grant days by hand</h3>
              <p className="mt-0.5 text-xs text-gray-600">For a voucher paid for but lost, or a complaint. Added after the current expiry when it is still ahead.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="grant-days" className={LABEL}>Days</label>
                <input id="grant-days" type="number" required min={1} max={1098} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${FIELD} w-28`} />
              </div>
              <div>
                <label htmlFor="grant-plan" className={LABEL}>Plan</label>
                <select id="grant-plan" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className={`${FIELD} w-auto`}>
                  <option value="basic">Basic</option>
                  <option value="plus">Plus</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="grant-reason" className={LABEL}>Reason</label>
                <input id="grant-reason" required minLength={3} maxLength={300} placeholder="e.g. OR 1234, voucher lost" value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} />
              </div>
              <button type="submit" disabled={busy !== null || reason.trim().length < 3 || !(days >= 1 && days <= 1098)} className={PRIMARY}>
                {busy === 'grant' ? 'Granting…' : 'Grant'}
              </button>
            </div>
          </form>
        </div>
      )}

      <Notice notice={notice} />
    </div>
  );
}
