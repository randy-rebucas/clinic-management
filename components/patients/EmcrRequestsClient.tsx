'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { formatApiError } from '../utils/apiError';
import PatientSearch, { type PatientOption } from './PatientSearch';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const LINK = `rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`;

type Status = 'pending' | 'approved' | 'rejected';

interface EmcrRequest {
  id: string;
  kind: 'access' | 'adult_profile';
  status: Status;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  relationship: string | null;
  firstName: string;
  lastName: string | null;
  dateOfBirth: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  holder: { name: string | null; phone: string | null } | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string | null; hasPhone: boolean; hasEmail: boolean } | null;
}

const TABS: { status: Status; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
];

const GUIDANCE = {
  access:
    'Check the person’s identity, update the record’s mobile number/email if needed, then Approve — sign-in instructions go to the contact on the record.',
  adult_profile: 'Approve only after the patient (or their legal representative) confirms consent in person.',
};

type Notice = { tone: 'ok' | 'error'; text: string };

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const birthDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export default function EmcrRequestsClient({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState<Status>('pending');
  const [requests, setRequests] = useState<EmcrRequest[] | null>(null);
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
    fetch(`/api/emcr-requests?${new URLSearchParams({ status })}`, { signal: controller.signal })
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
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">eMCR requests</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 sm:text-base">
            People asking to use the eMCR patient app with this clinic&rsquo;s records: sign-in requests from patients we couldn&rsquo;t match, and account holders asking to manage an adult&rsquo;s records.
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
              id={`emcr-tab-${t.status}`}
              aria-selected={status === t.status}
              aria-controls="emcr-panel"
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

        <div id="emcr-panel" role="tabpanel" aria-labelledby={`emcr-tab-${status}`} className="flex flex-col gap-5">
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
            <p className="text-sm text-gray-600">You can see these requests; someone who can edit patient records has to approve them.</p>
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
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-600">
              {status === 'pending'
                ? 'Nothing waiting. Requests appear here when someone asks for eMCR access at this clinic.'
                : status === 'approved'
                  ? 'No approved requests yet.'
                  : 'No rejected requests.'}
            </div>
          ) : (
            <ul className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {requests?.map((r) => (
                <RequestCard key={r.id} r={r} canWrite={canWrite} onDecided={decided} onError={(text) => setNotice({ tone: 'error', text })} />
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
  onDecided,
  onError,
}: {
  r: EmcrRequest;
  canWrite: boolean;
  onDecided: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PatientOption | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [problem, setProblem] = useState<{ text: string; patientId?: string } | null>(null);

  const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
  const choosing = !r.patient || picking;
  const record = choosing
    ? picked && { id: picked._id, name: `${picked.firstName} ${picked.lastName}`, code: picked.patientCode ?? null, hasPhone: !!picked.phone, hasEmail: !!picked.email }
    : r.patient && { id: r.patient.id, name: `${r.patient.firstName} ${r.patient.lastName}`, code: r.patient.patientCode, hasPhone: r.patient.hasPhone, hasEmail: r.patient.hasEmail };
  const pendingReq = r.status === 'pending';
  const isAccess = r.kind === 'access';

  async function decide(action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm(`Reject ${name}’s request? They aren’t told; they can ask again.`)) return;
    if (action === 'approve' && !isAccess && !window.confirm(`Has ${record?.name ?? name} (or their legal representative) confirmed consent in person?`)) return;
    setBusy(action);
    setProblem(null);
    try {
      const res = await fetch(`/api/emcr-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'approve' && choosing && picked ? { patientId: picked._id } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const text = formatApiError(json, 'That didn’t go through. Try again.');
        if (json?.code === 'NO_CONTACT') setProblem({ text, patientId: record?.id });
        else setProblem({ text });
        return;
      }
      if (action === 'reject') onDecided(`Rejected ${name}’s request.`);
      else if (isAccess) onDecided(`Approved. Sign-in instructions went to ${record?.name ?? name} by ${json.data?.sentBy === 'sms' ? 'text message' : 'email'}.`);
      else onDecided(`Approved. The eMCR account can now manage ${record?.name ?? name}’s records.`);
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
            {isAccess ? 'Sign-in request' : 'Manage an adult’s records'}
          </p>
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-gray-900">{name}</h2>
        </div>
        <p className="text-xs text-gray-500">
          Asked {dateTime(r.createdAt)}
          {r.decidedAt && <> · {r.status === 'approved' ? 'approved' : 'rejected'} {dateTime(r.decidedAt)}</>}
        </p>
      </div>

      <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {isAccess ? (
            <>
              <div>
                <dt className="text-xs text-gray-500">Name they typed</dt>
                <dd className="mt-0.5 text-gray-900">{name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Date of birth</dt>
                <dd className="mt-0.5 text-gray-900">{r.dateOfBirth ? birthDate(r.dateOfBirth) : '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Contact they gave</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-900">{[r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || '—'}</dd>
                <dd className="mt-0.5 text-xs text-gray-500">Not used to send anything: instructions go to the record&rsquo;s contact.</dd>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Who is asking</dt>
                <dd className="mt-0.5 text-gray-900">
                  {r.holder?.name ? <strong className="font-semibold">{r.holder.name}</strong> : 'An eMCR account holder'}
                  {r.relationship ? <>, who says they are the patient&rsquo;s <strong className="font-semibold">{r.relationship}</strong></> : ''}
                  {r.holder?.phone ? <span className="ml-1 font-mono text-xs text-gray-500">({r.holder.phone})</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Patient</dt>
                <dd className="mt-0.5 text-gray-900">{name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Date of birth</dt>
                <dd className="mt-0.5 text-gray-900">{r.dateOfBirth ? birthDate(r.dateOfBirth) : '—'}</dd>
              </div>
            </>
          )}
          {r.note && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Note</dt>
              <dd className="mt-0.5 text-gray-900">{r.note}</dd>
            </div>
          )}
        </dl>

        <div className="space-y-3">
          {choosing && pendingReq && canWrite ? (
            <div>
              <PatientSearch label="Patient record" value={picked} onChange={setPicked} />
              {r.patient && (
                <button type="button" onClick={() => { setPicking(false); setPicked(null); }} className={`${LINK} mt-1.5 text-xs`}>
                  Keep {r.patient.firstName} {r.patient.lastName}
                </button>
              )}
            </div>
          ) : record ? (
            <div>
              <p className="text-xs text-gray-500">Patient record</p>
              <p className="mt-0.5 text-sm">
                <Link href={`/patients/${record.id}`} className={LINK}>{record.name}</Link>
                {record.code && <span className="ml-2 font-mono text-xs text-gray-500">{record.code}</span>}
              </p>
              {pendingReq && canWrite && (
                <button type="button" onClick={() => setPicking(true)} className={`${LINK} mt-1 text-xs`}>
                  Choose a different record
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{pendingReq ? 'No record matched yet.' : 'No record.'}</p>
          )}

          {record && isAccess && pendingReq && (
            <p className={`text-xs ${record.hasPhone || record.hasEmail ? 'text-gray-600' : 'font-medium text-amber-800'}`}>
              {record.hasPhone && record.hasEmail
                ? 'The record has a mobile number and an email.'
                : record.hasPhone
                  ? 'The record has a mobile number, no email.'
                  : record.hasEmail
                    ? 'The record has an email, no mobile number.'
                    : 'The record has no mobile number or email. Add one before approving.'}{' '}
              <Link href={`/patients/${record.id}/edit`} className={LINK} target="_blank">Edit the record</Link>
            </p>
          )}
        </div>
      </div>

      {pendingReq && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <p className="flex items-start gap-2 text-sm text-gray-700">
            <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            {GUIDANCE[r.kind]}
          </p>
          {canWrite && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 basis-60">
                <label htmlFor={`note-${r.id}`} className="sr-only">Note (optional)</label>
                <input id={`note-${r.id}`} maxLength={500} placeholder="Note (optional), e.g. ID checked" value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
              </div>
              <button type="button" onClick={() => decide('reject')} disabled={!!busy} className={SECONDARY}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
              <button type="button" onClick={() => decide('approve')} disabled={!!busy || !record} className={`${PRIMARY} disabled:cursor-not-allowed`}>
                <Svg d={ICON.check} />
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-red-800">
              {problem.text}{' '}
              {problem.patientId && (
                <Link href={`/patients/${problem.patientId}/edit`} className={LINK} target="_blank">Edit the record</Link>
              )}
            </p>
          )}
        </div>
      )}
    </li>
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
