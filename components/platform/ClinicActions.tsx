'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING } from '../appointments/shared';

const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

async function call(url: string, method: string, body: unknown): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, error: 'Your platform session ended. Sign in again.' };
    if (!res.ok || !json?.success) return { ok: false, error: formatApiError(json, 'That didn’t go through') };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: 'The server couldn’t be reached. Nothing was changed.' };
  }
}

export default function ClinicActions({
  clinicId,
  status,
  admins,
}: {
  clinicId: string;
  status: 'active' | 'inactive' | 'suspended';
  admins: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [viewAs, setViewAs] = useState(admins[0]?.id ?? '');
  const [days, setDays] = useState(14);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const openViewAs = () =>
    run('view', async () => {
      // Opened inside the click so popup blockers allow it; pointed at the clinic once the link is ready.
      const tab = window.open('', '_blank');
      if (tab) tab.opener = null;
      const r = await call(`/api/platform/tenants/${clinicId}/view-as`, 'POST', viewAs ? { userId: viewAs } : {});
      if (!r.ok) {
        tab?.close();
        return setNotice({ tone: 'error', text: r.error });
      }
      if (tab) tab.location.href = r.data.url;
      else window.location.href = r.data.url;
    });

  const patch = (key: string, body: Record<string, unknown>, done: string) =>
    run(key, async () => {
      const r = await call(`/api/platform/tenants/${clinicId}`, 'PATCH', body);
      if (!r.ok) return setNotice({ tone: 'error', text: r.error });
      setNotice({ tone: 'ok', text: done });
      router.refresh();
    });

  const suspended = status !== 'active';

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">View as clinic</h3>
        <p className="mt-0.5 text-xs text-gray-600">Opens the clinic in a new tab as one of its admins: read-only, 30 minutes, written to the clinic&rsquo;s audit log.</p>
        {admins.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="view-as-user">Admin to view as</label>
            <select id="view-as-user" value={viewAs} onChange={(e) => setViewAs(e.target.value)} className={`${FIELD} w-auto max-w-full`}>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
            </select>
            <button type="button" onClick={openViewAs} disabled={!!busy || suspended} className={PRIMARY}>
              {busy === 'view' ? 'Opening…' : 'View as clinic'}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">The clinic has no active admin to view as.</p>
        )}
        {suspended && admins.length > 0 && <p className="mt-1 text-xs text-gray-500">Reactivate the clinic to view it.</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Extend the current period</h3>
        <p className="mt-0.5 text-xs text-gray-600">Adds days to the trial or paid period, from its end or from today if it already ended.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="extend-days">Days</label>
          <input id="extend-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${FIELD} w-24`} />
          <span className="text-sm text-gray-600">days</span>
          <button type="button" className={OUTLINE} disabled={!!busy || !(days >= 1 && days <= 365)} onClick={() => patch('extend', { extendDays: days }, `Extended by ${days} days.`)}>
            {busy === 'extend' ? 'Saving…' : 'Extend'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">{suspended ? 'Reactivate' : 'Suspend'}</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          {suspended
            ? 'Staff can sign in again. Their data was kept.'
            : 'Signs every staff member out and blocks sign-in. Nothing is deleted.'}
        </p>
        <button
          type="button"
          className={`${OUTLINE} mt-2 ${suspended ? '' : 'text-rose-700 hover:border-rose-700'}`}
          disabled={!!busy}
          onClick={() => {
            if (!suspended && !window.confirm('Suspend this clinic? Every staff member is signed out at once.')) return;
            patch('status', { status: suspended ? 'active' : 'suspended' }, suspended ? 'Clinic reactivated.' : 'Clinic suspended.');
          }}
        >
          {busy === 'status' ? 'Saving…' : suspended ? 'Reactivate clinic' : 'Suspend clinic'}
        </button>
      </div>

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
