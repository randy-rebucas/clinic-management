'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlatformReferralRow } from '@/lib/rep-referral';
import { OUTLINE, Notice, callPlatform } from './platform-api';
import { day } from './shared';

function StatusPill({ row }: { row: PlatformReferralRow }) {
  const usedUp = row.maxUses !== null && row.uses >= row.maxUses;
  const [text, tone] =
    row.status === 'disabled' ? ['Off', 'bg-gray-100 text-gray-600']
    : row.expired ? ['Expired', 'bg-amber-50 text-amber-800']
    : usedUp ? ['Used up', 'bg-amber-50 text-amber-800']
    : ['Active', 'bg-emerald-50 text-emerald-800'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
}

/** Every rep referral code with its use count; copy a code's signup link, or turn it off and on. */
export default function ReferralCodeTable({ codes }: { codes: PlatformReferralRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function toggle(row: PlatformReferralRow) {
    const next = row.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(`Turn off ${row.code}? Its link stops working; clinics already linked keep their rep.`)) return;
    setBusyId(row.id);
    setNotice(null);
    const r = await callPlatform(`/api/platform/referral-codes/${row.id}`, 'PATCH', { status: next });
    setBusyId(null);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    router.refresh();
  }

  async function copy(row: PlatformReferralRow) {
    try {
      await navigator.clipboard.writeText(row.link);
      setNotice({ tone: 'ok', text: `Copied the signup link for ${row.code}.` });
    } catch {
      setNotice({ tone: 'error', text: row.link });
    }
  }

  if (!codes.length) {
    return <p className="px-5 py-8 text-center text-sm text-gray-500">No codes yet. Reps’ own codes appear here once they open Refer a clinic in the eMedRoute app.</p>;
  }

  return (
    <div className="mt-3">
      <div className="px-5"><Notice notice={notice} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th scope="col" className="px-5 py-2 font-medium">Code</th>
              <th scope="col" className="px-3 py-2 font-medium">Rep</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Clinics</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-5 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-5 py-3">
                  <p className="font-mono font-semibold text-gray-900">{row.code}</p>
                  <p className="text-xs text-gray-500">
                    {row.source === 'rep' ? 'Rep’s own code' : row.label || 'Custom code'} · {day(row.createdAt)}
                    {row.expiresAt ? ` · until ${day(row.expiresAt)}` : ''}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-gray-900">{row.rep.name}{row.rep.company ? ` (${row.rep.company})` : ''}</p>
                  <p className="text-xs text-gray-500">{row.rep.email}</p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{row.uses}{row.maxUses !== null ? ` / ${row.maxUses}` : ''}</td>
                <td className="px-3 py-3"><StatusPill row={row} /></td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => copy(row)} className={OUTLINE}>Copy link</button>
                    <button type="button" disabled={busyId === row.id} onClick={() => toggle(row)} className={OUTLINE}>
                      {row.status === 'active' ? 'Turn off' : 'Turn on'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
