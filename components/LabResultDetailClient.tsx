'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog, Modal } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ageFrom } from './visits/form/PatientSummary';
import AttachForm from './records/AttachForm';
import { fileSize } from './records/labels';
import ResultsEditor from './lab-results/ResultsEditor';
import { LAB_STATE, URGENCY_BADGE, type LabStatus } from './lab-results/shared';
import { analyteLabel, flagFor, localDay, previousValue, rowsFrom, type EarlierResult, type ValueMap } from './lab-results/results';
import type { LabResultDetailPermissions } from '@/lib/lab-results-page';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string; email?: string; phone?: string; dateOfBirth?: string } | null;
  visit?: { _id: string; visitCode: string; date: string } | null;
  orderedBy?: { _id: string; name: string } | null;
  receivedBy?: { _id: string; name: string } | null;
  receivedAt?: string;
  performedBy?: { _id: string; name: string } | null;
  reviewedBy?: { _id: string; name: string } | null;
  orderDate: string;
  request: {
    testType: string;
    testCode?: string;
    description?: string;
    urgency?: 'routine' | 'urgent' | 'stat';
    specialInstructions?: string;
    fastingRequired?: boolean;
    preparationNotes?: string;
  };
  thirdPartyLab?: { labName?: string; status?: 'pending' | 'sent' | 'received' | 'error'; sentAt?: string; receivedAt?: string; errorMessage?: string } | null;
  results?: ValueMap | string | null;
  resultDate?: string;
  interpretation?: string;
  referenceRanges?: Record<string, unknown> | null;
  abnormalFlags?: Record<string, string> | null;
  status: LabStatus;
  attachments?: { _id: string; filename: string; contentType?: string; size?: number; uploadDate?: string; notes?: string }[];
  reviewedAt?: string;
  awaitingReview?: boolean;
  notificationSent?: boolean;
  notificationSentAt?: string;
  notificationMethod?: 'email' | 'sms' | 'both';
}

const ICONS = {
  ...ICON,
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  pen: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  send: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  flask: 'M9 3h6m-5 0v6L4.5 18.5A2 2 0 006.2 21.5h11.6a2 2 0 001.7-3L14 9V3',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
/** Birth dates are stored at UTC midnight; read them in UTC so they never slip a day. */
const birthDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const METHOD_WORDS: Record<string, string> = { sms: 'text message', email: 'email', both: 'text message and email' };

type Confirm = 'cancel' | null;

export default function LabResultDetailClient({ labResultId, permissions }: { labResultId: string; permissions: LabResultDetailPermissions }) {
  const router = useRouter();
  const lab = useKeyedFetch<LabResult>(`/api/lab-results/${labResultId}`);
  const [editing, setEditing] = useState(false);
  const [telling, setTelling] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => localDay(new Date()));

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const l = lab.value;
  const history = (Array.isArray(lab.raw?.history) ? lab.raw.history : []) as EarlierResult[];

  const setStatus = async (status: LabStatus, message: string, fallback: string) => {
    setConfirm(null);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/lab-results/${labResultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setActionError(formatApiError(json, fallback));
        return;
      }
      lab.reload();
      setNotice(message);
    } catch {
      setActionError(`${fallback}. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, notes: string, isResult = false): Promise<boolean> => {
    setActionError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      if (notes) body.append('notes', notes);
      if (isResult) body.append('complete', '1');
      const res = await fetch(`/api/lab-results/${labResultId}/upload`, { method: 'POST', body });
      if (res.status === 401) {
        router.push('/login');
        return false;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setActionError(formatApiError(json, `${file.name} could not be attached`));
        return false;
      }
      const wasWaiting = l?.status === 'ordered' || l?.status === 'in-progress';
      lab.reload();
      setNotice(isResult && wasWaiting ? `${file.name} is attached and the result is marked as in.` : `${file.name} is attached.`);
      return true;
    } catch {
      setActionError(`${file.name} could not be attached. Check your connection and try again.`);
      return false;
    }
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!l && lab.error) {
    const missing = /not found/i.test(lab.error);
    const denied = /permission|forbidden|not allowed/i.test(lab.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Lab result not found' : denied ? 'You can’t open this lab result' : 'This lab result didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may have been deleted, or it belongs to another clinic.' : denied ? 'Ask a clinic admin if you need access to lab results.' : `${lab.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/lab-results" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All lab results
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={lab.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!l) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading lab result…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const st = LAB_STATE[l.status] ?? LAB_STATE.ordered;
  const cancelled = l.status === 'cancelled';
  const waiting = l.status === 'ordered' || l.status === 'in-progress';
  const resultIn = l.status === 'completed' || l.status === 'reviewed';
  const who = l.patient ? `${l.patient.firstName} ${l.patient.lastName}`.trim() : 'Patient record unavailable';
  const urgency = l.request?.urgency ? URGENCY_BADGE[l.request.urgency] : undefined;
  const values = l.results && typeof l.results === 'object' ? (l.results as ValueMap) : null;
  const hasValues = Boolean(values && Object.keys(values).length);
  // Once reviewed, a result is the clinicians' to change (the API refuses lab staff too).
  const canAct = permissions.canUpdate && !cancelled && !(permissions.isLab && l.status === 'reviewed');

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${cancelled ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-900'}`}>{who}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            {urgency && !cancelled && <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${urgency.badge}`}>{urgency.label}</span>}
            {l.requestCode && <span className="font-mono text-sm text-gray-500">{l.requestCode}</span>}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            <span className="font-semibold text-gray-900">{l.request?.testType}</span> · ordered {longDate(l.orderDate)} · {l.orderedBy?.name ?? 'No doctor recorded'}
            {l.visit && (
              <>
                {' · from visit '}
                {permissions.canSeeVisit ? (
                  <Link href={`/visits/${l.visit._id}`} className={`rounded font-mono font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {l.visit.visitCode}
                  </Link>
                ) : (
                  <span className="font-mono">{l.visit.visitCode}</span>
                )}
              </>
            )}
          </p>
        </div>

        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          {waiting && (
            <a
              href={`/api/lab-results/${l._id}/request-form`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.print} />
              Request form
            </a>
          )}
          {canAct && l.status === 'ordered' && !editing && (
            <SecondaryButton
              onClick={() =>
                setStatus('in-progress', permissions.isLab ? 'Request received by the lab.' : 'Marked as at the lab.', 'The status could not be changed')
              }
              disabled={busy}
              icon={ICONS.flask}
            >
              {permissions.isLab ? 'Receive request' : 'Sample sent to lab'}
            </SecondaryButton>
          )}
          {canAct && resultIn && !editing && (
            <>
              {!permissions.isLab && (
                <SecondaryButton onClick={() => setTelling(true)} disabled={busy} icon={ICONS.send}>
                  Tell the patient
                </SecondaryButton>
              )}
              <SecondaryButton onClick={() => setEditing(true)} disabled={busy} icon={ICONS.pen}>
                Edit results
              </SecondaryButton>
            </>
          )}
          {canAct && waiting && !editing && (
            <PrimaryButton onClick={() => setEditing(true)} disabled={busy} icon={ICONS.pen}>
              Enter results
            </PrimaryButton>
          )}
          {canAct && permissions.canReview && l.status === 'completed' && !editing && (
            <PrimaryButton onClick={() => setStatus('reviewed', 'Marked as reviewed by you.', 'The result could not be marked as reviewed')} disabled={busy} icon={ICONS.check}>
              Mark reviewed
            </PrimaryButton>
          )}
          {canAct && waiting && !editing && !permissions.isLab && (
            <button
              type="button"
              onClick={() => setConfirm('cancel')}
              disabled={busy}
              aria-label={`Cancel ${l.request?.testType ?? 'this test'}`}
              title="Cancel this test"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.x} />
            </button>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      <div className={`grid items-start gap-6 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ${lab.loading ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <ResultsPanel
            lab={l}
            history={history}
            editing={editing}
            today={today}
            canEnter={canAct && waiting}
            onSaved={() => {
              setEditing(false);
              lab.reload();
              setNotice(
                waiting
                  ? permissions.isLab
                    ? 'Results saved. The doctor reviews them before the patient is told.'
                    : 'Results saved. The result is marked as in.'
                  : 'Results saved.'
              );
            }}
            onCancel={() => setEditing(false)}
            hasValues={hasValues}
          />
          <AttachmentsPanel lab={l} canUpload={canAct} onUpload={upload} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="lab-request" title="Request">
            <dl className="divide-y divide-gray-100">
              <Field label="Test">
                {l.request?.testType}
                {l.request?.testCode && <span className="ml-2 font-mono text-xs text-gray-500">{l.request.testCode}</span>}
              </Field>
              {l.request?.description && <Field label="Details">{l.request.description}</Field>}
              <Field label="Urgency">{l.request?.urgency === 'stat' ? 'STAT, as soon as possible' : l.request?.urgency === 'urgent' ? 'Urgent' : 'Routine'}</Field>
              {l.request?.fastingRequired && <Field label="Fasting">Needed before the sample is taken</Field>}
              {l.request?.specialInstructions && <Field label="Instructions">{l.request.specialInstructions}</Field>}
              {l.request?.preparationNotes && <Field label="Preparation">{l.request.preparationNotes}</Field>}
              {l.thirdPartyLab?.labName && (
                <Field label="Lab">
                  {l.thirdPartyLab.labName}
                  <span className="block text-gray-500">{labState(l.thirdPartyLab)}</span>
                </Field>
              )}
            </dl>
          </Panel>

          <Panel id="lab-patient" title="Patient">
            {l.patient ? (
              <dl className="divide-y divide-gray-100">
                <Field label="Name">
                  {permissions.canSeePatient ? (
                    <Link href={`/patients/${l.patient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                  {l.patient.patientCode && <span className="ml-2 font-mono text-xs text-gray-500">{l.patient.patientCode}</span>}
                </Field>
                {l.patient.dateOfBirth && (
                  <Field label="Born">
                    <span className="font-mono">{birthDate(l.patient.dateOfBirth)}</span>
                    {ageFrom(l.patient.dateOfBirth) && <span className="text-gray-500"> · {ageFrom(l.patient.dateOfBirth)}</span>}
                  </Field>
                )}
                {l.patient.phone && (
                  <Field label="Phone">
                    <span className="font-mono">{l.patient.phone}</span>
                  </Field>
                )}
              </dl>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">The patient record isn’t available at this clinic.</p>
            )}
          </Panel>

          {!cancelled && (
            <Panel id="lab-followup" title="Review and messages">
              <dl className="divide-y divide-gray-100">
                {l.receivedBy && (
                  <Field label="Received by">
                    {l.receivedBy.name}
                    {l.receivedAt && <span className="block font-mono text-xs text-gray-500">{shortDate(l.receivedAt)}, {clock(l.receivedAt)}</span>}
                  </Field>
                )}
                <Field label="Result in">
                  {l.resultDate ? <span className="font-mono">{shortDate(l.resultDate)}</span> : <span className="text-gray-500">Not yet</span>}
                  {l.performedBy && <span className="block text-gray-500">by {l.performedBy.name}</span>}
                </Field>
                <Field label="Reviewed">
                  {l.status === 'reviewed' ? (
                    <>
                      {l.reviewedBy?.name ?? 'Yes'}
                      {l.reviewedAt && <span className="block font-mono text-xs text-gray-500">{shortDate(l.reviewedAt)}, {clock(l.reviewedAt)}</span>}
                    </>
                  ) : (
                    <span className="text-gray-500">{resultIn ? 'Not yet' : 'When the result is in'}</span>
                  )}
                </Field>
                <Field label="Patient told">
                  {l.notificationSent && l.notificationSentAt ? (
                    <>
                      By {METHOD_WORDS[l.notificationMethod ?? 'email'] ?? 'message'}
                      <span className="block font-mono text-xs text-gray-500">
                        {shortDate(l.notificationSentAt)}, {clock(l.notificationSentAt)}
                      </span>
                    </>
                  ) : l.status === 'completed' && l.awaitingReview ? (
                    <span className="text-gray-500">After the doctor reviews it</span>
                  ) : (
                    <span className="text-gray-500">Not yet</span>
                  )}
                </Field>
              </dl>
            </Panel>
          )}
        </aside>
      </div>

      {telling && l.patient && (
        <TellPatientDialog
          labId={l._id}
          name={who}
          phone={l.patient.phone}
          email={l.patient.email}
          onClose={() => setTelling(false)}
          onSent={(how) => {
            setTelling(false);
            lab.reload();
            setNotice(`${who} was sent ${how} saying the result is ready.`);
          }}
        />
      )}

      {confirm &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Cancel this test?"
            description={`${l.request?.testType} for ${who}${l.requestCode ? `, ${l.requestCode}` : ''}. It stays on file marked cancelled; no result can be entered for it. Order it again if it is still needed.`}
          >
            <button type="button" onClick={() => setConfirm(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep test
            </button>
            <button
              type="button"
              onClick={() => setStatus('cancelled', 'Test cancelled. It stays on file.', 'The test could not be cancelled')}
              className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}
            >
              Cancel test
            </button>
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const READ_COLS = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]';

function ResultsPanel({
  lab: l,
  history,
  editing,
  today,
  canEnter,
  onSaved,
  onCancel,
  hasValues,
}: {
  lab: LabResult;
  history: EarlierResult[];
  editing: boolean;
  today: string;
  canEnter: boolean;
  onSaved: () => void;
  onCancel: () => void;
  hasValues: boolean;
}) {
  const values = l.results && typeof l.results === 'object' ? (l.results as ValueMap) : null;
  const keys = Object.keys(values ?? {});
  const flagOf = (k: string) => {
    const stored = l.abnormalFlags?.[k];
    return stored === 'high' || stored === 'low' || stored === 'normal' ? stored : flagFor(values?.[k], l.referenceRanges?.[k]);
  };
  const outside = keys.filter((k) => {
    const f = flagOf(k);
    return f === 'high' || f === 'low';
  }).length;
  const waiting = l.status === 'ordered' || l.status === 'in-progress';

  if (editing) {
    return (
      <Panel id="lab-results" title={waiting ? 'Enter results' : 'Edit results'}>
        <ResultsEditor
          labId={l._id}
          initialRows={rowsFrom(values, l.referenceRanges, l.abnormalFlags, history[0])}
          initialInterpretation={l.interpretation ?? ''}
          initialDate={l.resultDate ? localDay(new Date(l.resultDate)) : today}
          waiting={waiting}
          today={today}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </Panel>
    );
  }

  return (
    <Panel
      id="lab-results"
      title="Results"
      aside={
        keys.length > 0 ? (
          outside > 0 ? (
            <span className="text-sm font-semibold text-red-700">{outside === 1 ? 'One value' : `${outside} values`} outside range</span>
          ) : keys.some((k) => flagOf(k)) ? (
            <span className="text-sm text-gray-500">All in range</span>
          ) : null
        ) : null
      }
    >
      {hasValues ? (
        <>
          <div aria-hidden="true" className={`hidden gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-xs font-medium text-gray-500 sm:grid ${READ_COLS}`}>
            <span>Test</span>
            <span>Result</span>
            <span>Reference range</span>
            <span>{history.length ? 'Last time' : ''}</span>
          </div>
          <dl className="divide-y divide-gray-100">
            {keys.map((k, i) => {
              const flag = flagOf(k);
              const off = flag === 'high' || flag === 'low';
              const range = l.referenceRanges?.[k];
              const prev = previousValue(history, k);
              return (
                <div key={k} className={`motion-row-in grid gap-x-4 gap-y-0.5 px-5 py-3 text-sm ${READ_COLS}`} style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
                  <dt className="font-medium text-gray-900">{analyteLabel(k)}</dt>
                  <dd className={`font-mono tabular-nums ${off ? 'font-semibold text-red-700' : 'text-gray-900'}`}>
                    {String(values?.[k] ?? '')}
                    {off && <span className="ml-2 font-sans text-xs font-semibold uppercase tracking-wide">{flag === 'high' ? 'High' : 'Low'}</span>}
                  </dd>
                  <dd className="font-mono tabular-nums text-gray-500">
                    {range ? (
                      <>
                        <span className="font-sans sm:hidden">Range </span>
                        {String(range)}
                      </>
                    ) : (
                      <span className="hidden sm:inline">—</span>
                    )}
                  </dd>
                  <dd className="text-gray-500">
                    {prev && (
                      <>
                        <span className="sm:hidden">Last time </span>
                        <span className={`font-mono tabular-nums ${prev.flag === 'high' || prev.flag === 'low' ? 'text-red-700' : 'text-gray-700'}`}>{String(prev.value)}</span>
                        {prev.date && <span className="text-xs"> · {shortDate(prev.date)}</span>}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {l.interpretation && (
            <div className="border-t border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Interpretation</h3>
              <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{l.interpretation}</p>
            </div>
          )}
        </>
      ) : typeof l.results === 'string' && l.results.trim() ? (
        <p className="max-w-prose whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-700">{l.results}</p>
      ) : l.status === 'cancelled' ? (
        <p className="px-5 py-4 text-sm text-gray-500">Cancelled before a result came in.</p>
      ) : waiting ? (
        <div className="px-5 py-5">
          <p className="text-sm text-gray-600">
            Waiting for the result.{' '}
            <span className="text-gray-500">
              Ordered{' '}
              {daysSince(l.orderDate) === 0 ? (
                'today'
              ) : (
                <>
                  <span className="font-mono tabular-nums">{daysSince(l.orderDate)}</span> {daysSince(l.orderDate) === 1 ? 'day' : 'days'} ago
                </>
              )}
              {canEnter ? '. Use Enter results above, or attach the lab’s report below.' : '.'}
            </span>
          </p>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-gray-500">No values were entered; the result is in the attached report.</p>
      )}
    </Panel>
  );
}

function AttachmentsPanel({ lab: l, canUpload, onUpload }: { lab: LabResult; canUpload: boolean; onUpload: (file: File, notes: string, isResult?: boolean) => Promise<boolean> }) {
  const files = l.attachments ?? [];
  const waiting = l.status === 'ordered' || l.status === 'in-progress';
  // Attaching a file only completes the test when someone says it is the result, not a request form or sample photo.
  const [isResult, setIsResult] = useState(false);
  if (!files.length && !canUpload) return null;
  return (
    <Panel id="lab-files" title="Lab report and files">
      {files.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No files yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {files.map((f) => (
            <li key={f._id} className="flex items-start gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/lab-results/${l._id}/files/${f._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}
                >
                  {f.filename}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <p className="text-gray-500">
                  {[f.size ? fileSize(f.size) : null, f.uploadDate ? shortDate(f.uploadDate) : null].filter(Boolean).join(' · ')}
                  {f.notes && <span className="text-gray-700"> · {f.notes}</span>}
                </p>
              </div>
              <a
                href={`/api/lab-results/${l._id}/files/${f._id}?download=1`}
                aria-label={`Download ${f.filename}`}
                title="Download"
                className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.download} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <AttachForm
          onUpload={async (file, notes) => {
            const ok = await onUpload(file, notes, waiting && isResult);
            if (ok) setIsResult(false);
            return ok;
          }}
          placeholder="e.g. CBC report from the lab"
          noun="lab result"
        >
          {waiting && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isResult}
                onChange={(e) => setIsResult(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
              />
              This file is the finished result (marks the test as in)
            </label>
          )}
        </AttachForm>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tell the patient
// ---------------------------------------------------------------------------

function TellPatientDialog({
  labId,
  name,
  phone,
  email,
  onClose,
  onSent,
}: {
  labId: string;
  name: string;
  phone?: string;
  email?: string;
  onClose: () => void;
  onSent: (how: string) => void;
}) {
  const ids = useId();
  const router = useRouter();
  const options = [
    { value: 'sms', label: 'Text message', detail: phone, ok: Boolean(phone) },
    { value: 'email', label: 'Email', detail: email, ok: Boolean(email) },
    { value: 'both', label: 'Both', detail: null, ok: Boolean(phone && email) },
  ] as const;
  const [method, setMethod] = useState<'sms' | 'email' | 'both'>(phone ? 'sms' : 'email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-results/${labId}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method }) });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'Nothing was sent'));
        return;
      }
      const sms = Boolean(json.data?.smsSent);
      const mail = Boolean(json.data?.emailSent);
      onSent(sms && mail ? 'a text message and an email' : sms ? 'a text message' : 'an email');
    } catch {
      setError('The server couldn’t be reached. Nothing was sent; try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-md" labelledBy={`${ids}-t`}>
      <div className="px-6 py-5">
        <h2 id={`${ids}-t`} className="text-lg font-bold tracking-tight text-gray-900">
          Tell {name} the result is ready
        </h2>
        <p className="mt-1 text-sm text-gray-600">The message says the result is in and asks them to contact the clinic. It doesn’t include the values.</p>
        {!phone && !email ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">There is no phone number or email on their record. Add one on the patient’s page first.</p>
        ) : (
          <fieldset className="mt-4">
            <legend className="sr-only">Send by</legend>
            <div className="flex flex-col gap-2">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-teal-dark has-[:checked]:bg-brand-teal-light/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${o.ok ? 'cursor-pointer border-gray-300 hover:border-gray-900' : 'cursor-not-allowed border-gray-200 text-gray-400'}`}
                >
                  <input type="radio" name={`${ids}-m`} value={o.value} checked={method === o.value} disabled={!o.ok} onChange={() => setMethod(o.value)} className="accent-brand-teal-dark" />
                  <span className="font-medium">{o.label}</span>
                  {o.detail ? <span className="ml-auto truncate font-mono text-xs text-gray-500">{o.detail}</span> : !o.ok && <span className="ml-auto text-xs">Not on file</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
        <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
          Cancel
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || (!phone && !email)}
          aria-busy={busy}
          className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.send} />
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function labState(t: NonNullable<LabResult['thirdPartyLab']>) {
  if (t.status === 'received' && t.receivedAt) return `Result received ${shortDate(t.receivedAt)}`;
  if (t.status === 'sent' && t.sentAt) return `Sent ${shortDate(t.sentAt)}`;
  if (t.status === 'error') return `Couldn’t be sent${t.errorMessage ? `: ${t.errorMessage}` : ''}`;
  return 'Not sent yet';
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/lab-results" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All lab results
    </Link>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

function SecondaryButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait ${FOCUS_RING}`}
    >
      <Svg d={icon} />
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait ${FOCUS_RING}`}
    >
      <Svg d={icon} />
      {children}
    </button>
  );
}
