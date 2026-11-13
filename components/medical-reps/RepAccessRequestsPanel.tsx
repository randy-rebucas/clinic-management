'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg, dayLabel } from '../appointments/shared';

interface RequestRep {
  firstName: string;
  lastName: string;
  title?: string;
  company?: string;
  territory?: string;
  phone?: string;
  email?: string;
}

interface AccessRequest {
  _id: string;
  repName: string;
  repCompany?: string;
  message?: string;
  createdAt: string;
  medicalRepresentativeId?: RequestRep | null;
}

const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const QUIET = `rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 ${FOCUS_RING}`;

const nameOf = (r: AccessRequest) => {
  const p = r.medicalRepresentativeId;
  return p ? `${p.title ? `${p.title} ` : ''}${p.firstName} ${p.lastName}` : r.repName;
};

/**
 * Reps asking to be added to this clinic's representatives (the clinic isn't open to all reps).
 * Approve adds them to the list below; decline leaves them out. Hidden when nothing is waiting.
 */
export default function RepAccessRequestsPanel({ focusRequestId, onApproved }: { focusRequestId?: string; onApproved?: () => void }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<{ request: AccessRequest; note: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/rep-access-requests?status=pending&limit=100', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || 'Could not load access requests');
        setRequests(json.data);
        setError(null);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      });
    return () => ctrl.abort();
  }, [reloadCount]);

  const answer = async (request: AccessRequest, action: 'approve' | 'decline', note?: string) => {
    setBusyId(request._id);
    setNotice(null);
    try {
      const res = await fetch(`/api/rep-access-requests/${request._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(note ? { note } : {}) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Could not answer the request');
      setNotice(json.message);
      setDeclining(null);
      setReloadCount((n) => n + 1);
      if (action === 'approve') onApproved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (!requests.length && !error && !notice) return null;

  return (
    <section aria-labelledby="rep-access-title" className="mb-6 flex flex-col gap-3">
      <h2 id="rep-access-title" className="text-base font-bold text-gray-900">
        Reps asking to work with you{' '}
        {requests.length > 0 && <span className="rounded bg-amber-50 px-1.5 font-mono text-sm text-amber-800 ring-1 ring-amber-200">{requests.length}</span>}
      </h2>
      {notice && (
        <p role="status" className="motion-panel-in flex items-start gap-2 rounded-lg border border-brand-teal/30 bg-brand-teal-light p-3 text-sm font-medium text-brand-teal-deep">
          <Svg d={ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
      {requests.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {requests.map((r) => {
            const p = r.medicalRepresentativeId;
            return (
              <li key={r._id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${r._id === focusRequestId ? 'bg-amber-50/60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">{nameOf(r)}</p>
                  <p className="text-sm text-gray-600">
                    {[p?.company || r.repCompany, p?.territory].filter(Boolean).join(' · ') || 'Company not given'}
                    {p?.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${p.phone}`} className="font-medium text-brand-teal-deep underline-offset-2 hover:underline">
                          {p.phone}
                        </a>
                      </>
                    )}
                    {p?.email && <> · {p.email}</>}
                  </p>
                  {r.message && <p className="mt-2 text-sm text-gray-900">“{r.message}”</p>}
                  <p className="mt-1 text-xs text-gray-500">Asked {dayLabel(r.createdAt.slice(0, 10), { month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <button type="button" disabled={busyId === r._id} onClick={() => answer(r, 'approve')} className={PRIMARY}>
                    Add to my reps
                  </button>
                  <button type="button" disabled={busyId === r._id} onClick={() => setDeclining({ request: r, note: '' })} className={QUIET}>
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!declining} onOpenChange={(o) => !o && setDeclining(null)}>
        {declining && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void answer(declining.request, 'decline', declining.note.trim() || undefined);
            }}
          >
            <h2 className="text-lg font-bold text-gray-900">Decline {nameOf(declining.request)}?</h2>
            <p className="mt-1 text-sm text-gray-600">They won’t be able to book your visiting hours. They can ask again after 30 days.</p>
            <label htmlFor="rep-access-note" className="mt-4 block text-sm font-medium text-gray-700">
              Reason for the rep (optional)
            </label>
            <textarea
              id="rep-access-note"
              rows={3}
              maxLength={1000}
              value={declining.note}
              onChange={(e) => setDeclining({ ...declining, note: e.target.value })}
              className={`${FIELD} mt-1`}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeclining(null)} className={QUIET}>
                Keep it
              </button>
              <button type="submit" disabled={busyId === declining.request._id} className={PRIMARY}>
                Decline
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
