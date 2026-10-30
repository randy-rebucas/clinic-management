'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { formatApiError } from '../utils/apiError';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const LINK = `rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`;

type Status = 'pending' | 'released' | 'declined' | 'cancelled' | 'revoked';

interface DocumentRequest {
  id: string;
  kind: 'medical_records' | 'medical_certificate' | 'clinical_abstract';
  kindLabel: string;
  requestCode: string;
  status: Status;
  expired: boolean;
  purpose: string;
  purposeLabel: string;
  purposeNote: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  visit: { id: string; visitCode: string; date: string; status: string; provider: string | null; hasRecommendations: boolean } | null;
  abstract: { savedAt: string | null; author: string | null; missing: string[] } | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  availableUntil: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string | null; dateOfBirth: string | null } | null;
}

const TABS: { status: Status; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'released', label: 'Released' },
  { status: 'declined', label: 'Declined' },
  { status: 'revoked', label: 'Withdrawn' },
  { status: 'cancelled', label: 'Cancelled' },
];

const EMPTY: Record<Status, string> = {
  pending: 'Nothing waiting. Requests appear here when a patient asks for their records, a medical certificate or a clinical abstract in the eMCR app.',
  released: 'Nothing released yet.',
  declined: 'No declined requests.',
  revoked: 'Nothing withdrawn.',
  cancelled: 'No requests cancelled by patients.',
};

type Notice = { tone: 'ok' | 'error'; text: string };

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });
const ymd = (v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export default function DocumentRequestsClient({ canWrite, canCertify }: { canWrite: boolean; canCertify: boolean }) {
  const [status, setStatus] = useState<Status>('pending');
  const [requests, setRequests] = useState<DocumentRequest[] | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/document-requests?${new URLSearchParams({ status })}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The requests didn’t load.'));
        setRequests(json.data.requests);
        setPending(json.data.pending);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'The server couldn’t be reached.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, reloadKey]);

  const choose = (s: Status) => {
    if (s === status) return;
    setStatus(s);
    setLoading(true);
    setRequests(null);
    setNotice(null);
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TABS.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    choose(TABS[next].status);
    tabRefs.current[next]?.focus();
  };

  const decided = (text: string) => {
    setNotice({ tone: 'ok', text });
    reload();
  };

  return (
    <section className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Document requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 sm:text-base">
            Patients asking through the eMCR app for a copy of their medical records, a medical certificate for a visit, or a clinical abstract. Preview what they&rsquo;ll receive, then release it or decline with a reason. Released documents are sealed and can be downloaded for 30 days.
          </p>
        </header>

        <div role="tablist" aria-label="Request status" className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t, i) => (
            <button
              key={t.status}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`doc-tab-${t.status}`}
              aria-selected={status === t.status}
              aria-controls="doc-panel"
              tabIndex={status === t.status ? 0 : -1}
              onClick={() => choose(t.status)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${status === t.status ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {t.label}
              {t.status === 'pending' && pending !== null && (
                <span className={`ml-1.5 font-mono text-xs tabular-nums ${pending > 0 ? 'font-bold text-amber-700' : 'font-medium text-gray-500'}`}>{pending}</span>
              )}
            </button>
          ))}
        </div>

        <div id="doc-panel" role="tabpanel" aria-labelledby={`doc-tab-${status}`} className="flex flex-col gap-5">
          <div aria-live="polite">
            {notice && (
              <div
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`motion-panel-in flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep'}`}
              >
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className={`-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100 ${FOCUS_RING}`} aria-label="Dismiss">
                  <Svg d={ICON.x} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {!canWrite && status === 'pending' && (
            <p className="text-sm text-gray-600">You can see these requests; someone who can edit clinical notes has to release them.</p>
          )}

          {requests === null && !error ? (
            <Skeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-5 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-600">
                <Svg d={ICON.alert} className="h-5 w-5" />
              </span>
              <p className="text-sm text-gray-700">{error}</p>
              <button type="button" onClick={reload} className={`${PRIMARY} px-4 py-2`}>
                Try again
              </button>
            </div>
          ) : requests && requests.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-600">{EMPTY[status]}</div>
          ) : (
            <ul className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {requests?.map((r) => (
                <RequestCard key={r.id} r={r} canWrite={canWrite} canCertify={canCertify} onDecided={decided} onError={(text) => setNotice({ tone: 'error', text })} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function RequestCard({
  r,
  canWrite,
  canCertify,
  onDecided,
  onError,
}: {
  r: DocumentRequest;
  canWrite: boolean;
  canCertify: boolean;
  onDecided: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'release' | 'decline' | 'revoke' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const name = r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : 'Patient record no longer available';
  const period = `${r.periodFrom ? ymd(r.periodFrom) : 'First record'} to ${r.periodTo ? ymd(r.periodTo) : 'latest'}`;
  const isPending = r.status === 'pending';
  const isLive = r.status === 'released' && !r.expired;
  // Certificates are released by doctors and clinic admins; anyone who can write visits may still decline.
  const doctorOnly = r.kind === 'medical_certificate' && !canCertify;

  async function decide(action: 'release' | 'decline' | 'revoke') {
    if (action === 'decline' && !note.trim()) {
      setProblem('Write the reason in the note first. The patient sees it.');
      return;
    }
    if (action === 'release' && !window.confirm(`Release ${r.requestCode} to ${name}? They can download it, sealed, for 30 days.`)) return;
    if (action === 'revoke' && !window.confirm(`Withdraw ${r.requestCode}? The download stops working and copies already downloaded no longer verify.`)) return;
    setBusy(action);
    setProblem(null);
    try {
      const res = await fetch(`/api/document-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setProblem(formatApiError(json, 'That didn’t go through. Try again.'));
        return;
      }
      onDecided(
        action === 'release'
          ? `Released ${r.requestCode}. ${name} can download it in the app now.`
          : action === 'decline'
            ? `Declined ${r.requestCode}. ${name} sees your reason in the app.`
            : `Withdrew ${r.requestCode}.`
      );
    } catch {
      onError('The server couldn’t be reached. Nothing was changed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {r.kindLabel} <span className="ml-1 font-mono">{r.requestCode}</span>
          </p>
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-gray-900">
            {r.patient ? (
              <Link href={`/patients/${r.patient.id}`} className={LINK}>
                {name}
              </Link>
            ) : (
              name
            )}
            {r.patient?.patientCode && <span className="ml-2 font-mono text-xs font-medium text-gray-500">{r.patient.patientCode}</span>}
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          Asked {dateTime(r.createdAt)}
          {r.decidedAt && !isPending && (
            <>
              {' '}
              · {r.status} {dateTime(r.decidedAt)}
              {r.decidedBy && <> by {r.decidedBy}</>}
            </>
          )}
        </p>
      </div>

      <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">For</dt>
            <dd className="mt-0.5 text-gray-900">{r.purposeLabel}</dd>
          </div>
          {r.kind === 'medical_certificate' ? (
            <div>
              <dt className="text-xs text-gray-500">Visit</dt>
              <dd className="mt-0.5 text-gray-900">
                {r.visit ? (
                  <Link href={`/visits/${r.visit.id}`} className={LINK} target="_blank">
                    {dateOnly(r.visit.date)} · {r.visit.visitCode}
                  </Link>
                ) : (
                  'No longer available'
                )}
                {r.visit?.provider && <span className="block text-xs text-gray-500">{r.visit.provider}</span>}
              </dd>
            </div>
          ) : r.kind === 'clinical_abstract' ? (
            <div>
              <dt className="text-xs text-gray-500">Abstract</dt>
              <dd className="mt-0.5 text-gray-900">
                {r.abstract?.savedAt ? (
                  <>
                    Written{r.abstract.author && <> by {r.abstract.author}</>}
                    <span className="block text-xs text-gray-500">Saved {dateTime(r.abstract.savedAt)}</span>
                  </>
                ) : (
                  <span className="text-amber-800">Not written yet</span>
                )}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-xs text-gray-500">Period</dt>
              <dd className="mt-0.5 text-gray-900">{period}</dd>
            </div>
          )}
          {r.purposeNote && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Patient&rsquo;s note</dt>
              <dd className="mt-0.5 text-gray-900">{r.purposeNote}</dd>
            </div>
          )}
          {r.decisionNote && !isPending && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">{r.status === 'released' ? 'Note' : 'Reason given to the patient'}</dt>
              <dd className="mt-0.5 text-gray-900">{r.decisionNote}</dd>
            </div>
          )}
        </dl>

        <div className="space-y-2 text-sm">
          {r.status === 'released' && (
            <p className={r.expired ? 'text-gray-500' : 'text-gray-700'}>
              {r.expired ? 'Download window ended' : 'Downloadable until'} {r.availableUntil ? dateTime(r.availableUntil) : '—'}.{' '}
              {r.downloadCount > 0
                ? `Downloaded ${r.downloadCount} time${r.downloadCount === 1 ? '' : 's'}, last ${r.lastDownloadedAt ? dateTime(r.lastDownloadedAt) : ''}.`
                : 'Not downloaded yet.'}
            </p>
          )}
          {r.patient && (r.kind === 'medical_records' || r.visit || r.abstract?.savedAt) && (
            <a href={`/api/document-requests/${r.id}/preview`} target="_blank" rel="noopener" className={`${SECONDARY} w-fit`}>
              {isPending ? 'Preview what they’ll receive' : 'Open preview'}
            </a>
          )}
        </div>
      </div>

      {r.kind === 'clinical_abstract' && isPending && canWrite && r.patient && (
        <AbstractEditor requestId={r.id} saved={!!r.abstract?.savedAt} onSaved={() => onDecided(`Saved the abstract for ${r.requestCode}.`)} />
      )}

      {(isPending || isLive) && canWrite && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          {isPending && (
            <p className="flex items-start gap-2 text-sm text-gray-700">
              <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              {r.kind === 'medical_certificate'
                ? r.visit && !r.visit.hasRecommendations
                  ? 'The visit has no recommendations yet. For sick leave or fitness to work, add them (rest days, restrictions) to the visit’s follow-up instructions first: the certificate prints what the visit says.'
                  : 'The certificate prints what the visit says. Check the preview, and fix the visit first if anything is missing.'
                : r.kind === 'clinical_abstract'
                  ? 'A doctor writes the abstract below, starting from a draft taken from the chart. It is signed by whoever saves it last. Check the preview, then release.'
                  : 'Check the preview before releasing. Decline only with a reason the patient can act on, for example a request a doctor needs to discuss in person.'}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-60">
              <label htmlFor={`note-${r.id}`} className="sr-only">
                Note
              </label>
              <input
                id={`note-${r.id}`}
                maxLength={500}
                placeholder={isPending ? 'Note for the patient (required to decline)' : 'Reason for withdrawing (optional)'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={FIELD}
              />
            </div>
            {isPending ? (
              <>
                <button type="button" onClick={() => decide('decline')} disabled={!!busy} className={SECONDARY}>
                  {busy === 'decline' ? 'Declining…' : 'Decline'}
                </button>
                <button type="button" onClick={() => decide('release')} disabled={!!busy || !r.patient || doctorOnly || (r.kind === 'medical_certificate' && !r.visit) || (r.kind === 'clinical_abstract' && !!r.abstract?.missing.length)} className={`${PRIMARY} disabled:cursor-not-allowed`}>
                  <Svg d={ICON.check} />
                  {busy === 'release' ? 'Releasing…' : 'Release'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => decide('revoke')} disabled={!!busy} className={SECONDARY}>
                {busy === 'revoke' ? 'Withdrawing…' : 'Withdraw'}
              </button>
            )}
          </div>
          {isPending && doctorOnly && <p className="text-sm text-gray-600">Only a doctor or clinic admin can release a medical certificate.</p>}
          {problem && (
            <p role="alert" className="text-sm text-red-800">
              {problem}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

interface AbstractData {
  abstract: Record<string, string>;
  fromChart: boolean;
  labels: Record<string, string>;
  required: string[];
}

/** Write or edit a clinical abstract (pending requests). Loads the saved text or a draft from the chart. */
function AbstractEditor({ requestId, saved, onSaved }: { requestId: string; saved: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AbstractData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    const controller = new AbortController();
    fetch(`/api/document-requests/${requestId}/abstract`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The abstract didn’t load.'));
        setData(json.data);
        setValues(json.data.abstract ?? {});
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : 'The abstract didn’t load.');
      });
    return () => controller.abort();
  }, [open, data, requestId]);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/document-requests/${requestId}/abstract`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setProblem(formatApiError(json, 'The abstract wasn’t saved. Try again.'));
        return;
      }
      setOpen(false);
      setData(null);
      onSaved();
    } catch {
      setProblem('The server couldn’t be reached. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-gray-100 px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className={saved ? SECONDARY : PRIMARY}>
          {saved ? 'Edit the abstract' : 'Write the abstract'}
        </button>
      </div>
    );
  }

  const WIDE = ['diagnosis', 'management', 'diagnostics'];
  const SHORT = ['consultations', 'chiefComplaint', 'condition'];
  return (
    <div className="space-y-4 border-t border-gray-100 px-5 py-4">
      {!data && !loadError && <div className="h-24 animate-pulse rounded bg-gray-100" aria-busy="true" aria-label="Loading the abstract" />}
      {loadError && (
        <p role="alert" className="text-sm text-red-800">
          {loadError}
        </p>
      )}
      {data && (
        <>
          {data.fromChart && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Drafted from the chart. Read every section before saving: you sign what you save.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {Object.keys(data.labels).map((field) => (
              <div key={field} className={WIDE.includes(field) ? 'md:col-span-2' : ''}>
                <label htmlFor={`abs-${requestId}-${field}`} className="text-xs font-semibold text-gray-700">
                  {data.labels[field]}
                  {data.required.includes(field) && <span className="ml-1 text-red-700">(required)</span>}
                </label>
                <textarea
                  id={`abs-${requestId}-${field}`}
                  rows={SHORT.includes(field) ? 2 : 3}
                  maxLength={4000}
                  value={values[field] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  placeholder={field === 'condition' ? 'e.g. Stable, ambulatory, fit to resume work' : undefined}
                  className={`${FIELD} mt-1`}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={saving} className={PRIMARY}>
              {saving ? 'Saving…' : 'Save abstract'}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className={SECONDARY}>
              Close
            </button>
            {problem && (
              <p role="alert" className="text-sm text-red-800">
                {problem}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading requests">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-gray-200 bg-white px-5 py-4">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-80 max-w-full animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-64 max-w-full animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
