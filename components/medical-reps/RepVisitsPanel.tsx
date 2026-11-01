'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg, dayLabel, timeLabel } from '../appointments/shared';
import { REP_VISIT_STATUS_LABEL, CLINIC_ACTIONS, type ClinicAction, type RepVisitStatus } from '@/lib/rep-visit-rules';

interface VisitRep {
  _id: string;
  firstName: string;
  lastName: string;
  title?: string;
  company?: string;
  territory?: string;
  phone?: string;
  email?: string;
}

interface VisitProduct {
  _id: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  dosage?: string;
  strength?: string;
  packaging: string;
  expiryDate: string;
  specifications?: string[];
}

interface RepVisit {
  _id: string;
  date: string;
  time: string;
  duration: number;
  purpose: string;
  status: RepVisitStatus;
  clinicNote?: string;
  checkedInAt?: string;
  cancelledBy?: 'rep' | 'clinic';
  medicalRepresentativeId?: VisitRep | null;
  productIds?: VisitProduct[];
}

type View = 'requested' | 'scheduled' | 'history';
const VIEWS: { key: View; label: string; statuses: RepVisitStatus[] }[] = [
  { key: 'requested', label: 'Requests', statuses: ['requested'] },
  { key: 'scheduled', label: 'Approved', statuses: ['scheduled'] },
  { key: 'history', label: 'History', statuses: ['completed', 'no-show', 'cancelled', 'declined'] },
];

/** Status colours from DESIGN.md: pending ochre, upcoming blue, seen teal, no-show rose, closed gray. */
const STATUS_STYLE: Record<RepVisitStatus, string> = {
  requested: 'bg-amber-50 text-amber-800 ring-amber-200',
  scheduled: 'bg-blue-50 text-blue-800 ring-blue-200',
  completed: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30',
  'no-show': 'bg-rose-50 text-rose-800 ring-rose-200',
  cancelled: 'bg-white text-gray-600 ring-gray-300 line-through',
  declined: 'bg-gray-100 text-gray-700 ring-gray-200',
};

const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const QUIET = `rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 ${FOCUS_RING}`;

const ACTION_COPY: Record<ClinicAction, { label: string; done: string; askNote?: string }> = {
  approve: { label: 'Approve', done: 'Visit approved. The rep has been told.' },
  decline: { label: 'Decline', done: 'Visit declined. The rep has been told.', askNote: 'Reason for the rep (optional)' },
  'check-in': { label: 'Check in', done: 'Rep checked in.' },
  complete: { label: 'Complete', done: 'Visit marked complete.' },
  'no-show': { label: 'No-show', done: 'Marked as a no-show.' },
  cancel: { label: 'Cancel visit', done: 'Visit cancelled. The rep has been told.', askNote: 'Reason for the rep (optional)' },
};

const repName = (r?: VisitRep | null) => (r ? `${r.title ? `${r.title} ` : ''}${r.firstName} ${r.lastName}` : 'Representative');
const dayOf = (iso: string) => iso.slice(0, 10);

export default function RepVisitsPanel({ focusVisitId }: { focusVisitId?: string }) {
  const [view, setView] = useState<View>('requested');
  const [visits, setVisits] = useState<RepVisit[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openProducts, setOpenProducts] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ visit: RepVisit; action: ClinicAction } | null>(null);
  const [note, setNote] = useState('');
  const [fullFor, setFullFor] = useState<RepVisit | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  // Loading is derived, so a view change or reload shows it without setting state in the effect.
  const requestKey = `${view}:${reloadCount}`;
  const loading = settledKey !== requestKey;
  const reload = () => setReloadCount((n) => n + 1);

  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      try {
        const statuses = VIEWS.find((x) => x.key === view)!.statuses;
        // History spans several statuses; ask for each and merge (each list is small).
        const pages = await Promise.all(
          statuses.map((s) => fetch(`/api/rep-visits?status=${s}&limit=100`, { signal: ctrl.signal }).then((r) => r.json()))
        );
        const failed = pages.find((p) => !p.success);
        if (failed) throw new Error(failed.error || 'Could not load rep visits');
        const rows: RepVisit[] = pages.flatMap((p) => p.data);
        if (view === 'history') rows.sort((a, b) => (dayOf(b.date) + b.time).localeCompare(dayOf(a.date) + a.time));
        setVisits(rows);
        setCounts(pages[0].counts ?? {});
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError((e as Error).message || 'Could not load rep visits');
      } finally {
        if (!ctrl.signal.aborted) setSettledKey(requestKey);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [view, requestKey]);

  const act = async (visit: RepVisit, action: ClinicAction, opts: { note?: string; override?: boolean } = {}) => {
    setBusyId(visit._id);
    setNotice(null);
    try {
      const res = await fetch(`/api/rep-visits/${visit._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(opts.note ? { note: opts.note } : {}), ...(opts.override ? { override: true } : {}) }),
      });
      const data = await res.json();
      if (data.code === 'SLOT_FULL') {
        setFullFor(visit);
        return;
      }
      if (!data.success) throw new Error(data.error || 'Could not update the visit');
      setNotice({ tone: 'ok', text: ACTION_COPY[action].done });
      reload();
    } catch (e) {
      setNotice({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const start = (visit: RepVisit, action: ClinicAction) => {
    if (ACTION_COPY[action].askNote) {
      setNote('');
      setNoteFor({ visit, action });
    } else {
      void act(visit, action);
    }
  };

  const actionsFor = (v: RepVisit): ClinicAction[] =>
    (Object.keys(CLINIC_ACTIONS) as ClinicAction[]).filter(
      (a) => (CLINIC_ACTIONS[a] as readonly string[]).includes(v.status) && !(a === 'check-in' && v.checkedInAt)
    );

  const historyCount = VIEWS[2].statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Rep visits" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const n = v.key === 'history' ? historyCount : counts[v.key] ?? 0;
          const selected = view === v.key;
          return (
            <button
              key={v.key}
              role="tab"
              aria-selected={selected}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                selected ? 'bg-brand-teal-dark text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-gray-400'
              }`}
            >
              {v.label}
              <span className={`rounded px-1.5 font-mono text-xs ${selected ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role="status"
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-3 text-sm font-medium ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep'
          }`}
        >
          <span className="flex items-start gap-2">
            <Svg d={notice.tone === 'error' ? ICON.alert : ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={loading}>
        {error ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button type="button" onClick={() => reload()} className={OUTLINE}>
              Try again
            </button>
          </div>
        ) : loading && !visits.length ? (
          <ul className="divide-y divide-gray-100" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex animate-pulse gap-4 p-4">
                <div className="h-10 w-24 rounded bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-gray-100" />
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                </div>
              </li>
            ))}
          </ul>
        ) : !visits.length ? (
          <div className="p-8 text-center">
            <p className="font-semibold text-gray-900">
              {view === 'requested' ? 'No requests waiting' : view === 'scheduled' ? 'No approved visits coming up' : 'No past rep visits yet'}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {view === 'requested'
                ? 'When a rep asks for a slot in your visiting hours, it shows up here for you to approve or decline.'
                : 'Visits you approve appear here until they are checked in and completed.'}
            </p>
          </div>
        ) : (
          <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
            {visits.map((v) => {
              const rep = v.medicalRepresentativeId;
              const products = v.productIds ?? [];
              const focused = v._id === focusVisitId;
              return (
                <li key={v._id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${focused ? 'bg-amber-50/60' : ''}`}>
                  <div className="w-full shrink-0 sm:w-36">
                    <p className="font-semibold text-gray-900">{dayLabel(dayOf(v.date), { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="font-mono text-sm text-gray-600">
                      {timeLabel(v.time)} · {v.duration} min
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{repName(rep)}</p>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[v.status]}`}>
                        {v.status === 'scheduled' && v.checkedInAt ? 'Checked in' : REP_VISIT_STATUS_LABEL[v.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {[rep?.company, rep?.territory].filter(Boolean).join(' · ') || 'Company not given'}
                      {rep?.phone && (
                        <>
                          {' · '}
                          <a href={`tel:${rep.phone}`} className="font-medium text-brand-teal-deep underline-offset-2 hover:underline">
                            {rep.phone}
                          </a>
                        </>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-gray-900">{v.purpose}</p>
                    {v.clinicNote && <p className="mt-1 text-sm text-gray-600">Your note: {v.clinicNote}</p>}
                    {v.status === 'cancelled' && v.cancelledBy && (
                      <p className="mt-1 text-xs text-gray-500">Cancelled by {v.cancelledBy === 'rep' ? 'the rep' : 'the clinic'}</p>
                    )}
                    {products.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          aria-expanded={openProducts === v._id}
                          onClick={() => setOpenProducts(openProducts === v._id ? null : v._id)}
                          className={`text-sm font-semibold text-brand-teal-deep underline-offset-2 hover:underline ${FOCUS_RING}`}
                        >
                          {openProducts === v._id ? 'Hide' : 'Show'} {products.length} product sheet{products.length === 1 ? '' : 's'}
                        </button>
                        {openProducts === v._id && (
                          <ul className="motion-panel-in mt-2 grid gap-2 sm:grid-cols-2">
                            {products.map((p) => (
                              <li key={p._id} className="rounded-md border border-gray-200 p-3 text-sm">
                                <p className="font-semibold text-gray-900">
                                  {p.name} {p.strength && <span className="font-normal text-gray-600">{p.strength}</span>}
                                </p>
                                <p className="text-gray-600">
                                  {p.category} · {p.manufacturer}
                                </p>
                                <p className="mt-1 text-gray-800">{p.description}</p>
                                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                                  {p.dosage && (
                                    <>
                                      <dt>Dosage</dt>
                                      <dd className="text-gray-900">{p.dosage}</dd>
                                    </>
                                  )}
                                  <dt>Packaging</dt>
                                  <dd className="text-gray-900">{p.packaging}</dd>
                                  <dt>Expires</dt>
                                  <dd className="font-mono text-gray-900">{dayOf(p.expiryDate)}</dd>
                                </dl>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {actionsFor(v).map((a) => (
                      <button
                        key={a}
                        type="button"
                        disabled={busyId === v._id}
                        onClick={() => start(v, a)}
                        className={a === 'approve' || a === 'check-in' || (a === 'complete' && v.checkedInAt) ? PRIMARY : a === 'decline' || a === 'cancel' ? QUIET : OUTLINE}
                      >
                        {ACTION_COPY[a].label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        {noteFor && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const { visit, action } = noteFor;
              setNoteFor(null);
              void act(visit, action, { note: note.trim() || undefined });
            }}
          >
            <h2 className="text-lg font-bold text-gray-900">
              {ACTION_COPY[noteFor.action].label} {repName(noteFor.visit.medicalRepresentativeId)}’s visit?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {dayLabel(dayOf(noteFor.visit.date))} at {timeLabel(noteFor.visit.time)}. The rep gets a notification.
            </p>
            <label htmlFor="rep-visit-note" className="mt-4 block text-sm font-medium text-gray-700">
              {ACTION_COPY[noteFor.action].askNote}
            </label>
            <textarea id="rep-visit-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD} mt-1`} />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteFor(null)} className={QUIET}>
                Keep it
              </button>
              <button type="submit" className={PRIMARY}>
                {ACTION_COPY[noteFor.action].label}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!fullFor} onOpenChange={(o) => !o && setFullFor(null)} role="alertdialog">
        {fullFor && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-900">That slot is full</h2>
            <p className="mt-1 text-sm text-gray-600">
              You already approved as many reps as you allow at {timeLabel(fullFor.time)} on {dayLabel(dayOf(fullFor.date))}. Approve this one anyway?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setFullFor(null)} className={QUIET}>
                Not now
              </button>
              <button
                type="button"
                className={PRIMARY}
                onClick={() => {
                  const v = fullFor;
                  setFullFor(null);
                  void act(v, 'approve', { override: true });
                }}
              >
                Approve anyway
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
