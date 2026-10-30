'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import VisitForm, { type VisitFormData } from './VisitForm';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { STATUS_BADGE, STATUS_LABEL, visitTypeLabel, type VisitStatus } from './visits/shared';
import VitalsPanel, { type VitalsReading, type VitalsRecord } from './visits/VitalsPanel';
import AttachForm from './records/AttachForm';
import { INVOICE_LABEL, LAB_LABEL, RX_LABEL, fileSize, money } from './records/labels';
import type { VisitDetailPermissions } from '@/lib/visits-page';
import PdfLink from './documents/PdfLink';

export interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
  } | null;
  provider?: { _id: string; name: string; email?: string } | null;
  date: string;
  visitType: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  admittingImpression?: string;
  vitals?: VitalsRecord | null;
  physicalExam?: Partial<Record<PhysicalExamKey, string>>;
  diagnoses: Array<{ code?: string; description?: string; primary?: boolean }>;
  /** Legacy free-text fields, from before SOAP notes. */
  assessment?: string;
  plan?: string;
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  treatmentPlan?: {
    medications?: Array<{ name: string; dosage: string; frequency: string; duration: string; quantity?: number; instructions?: string }>;
    procedures?: Array<{ name: string; description?: string; scheduledDate?: string }>;
    lifestyle?: Array<{ category: string; instructions: string }>;
    followUp?: { date?: string; instructions?: string; reminderSent?: boolean };
  };
  digitalSignature?: { providerName: string; signatureData: string; signedAt: string } | null;
  followUpDate?: string;
  followUpReminderSent?: boolean;
  followUpAppointmentId?: string | null;
  notes?: string;
  status: VisitStatus;
  attachments?: Array<{ _id?: string; filename: string; contentType?: string; size?: number; url?: string; uploadDate: string; notes?: string }>;
  updatedAt?: string;
}

type PhysicalExamKey =
  | 'general' | 'headEent' | 'heent' | 'chest' | 'lungs' | 'cardiovascular' | 'abdomen' | 'extremities'
  | 'neuro' | 'neurological' | 'skin' | 'lymphNotes' | 'breast' | 'rectum' | 'genitalia' | 'musculoskeletal' | 'other';

interface VisitContext {
  history: VitalsReading[];
  prescriptions: { _id: string; prescriptionCode: string; issuedAt: string; status: string; medications?: { name: string }[] }[] | null;
  labs: { _id: string; requestCode?: string; orderDate: string; status: string; request?: { testType?: string; urgency?: string } }[] | null;
  invoice: { _id: string; invoiceNumber: string; status: string; total?: number; outstandingBalance?: number } | null;
  access: { prescriptions: boolean; labs: boolean; invoices: boolean };
}

const ICONS = {
  ...ICON,
  pen: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  undo: 'M3 10h10a5 5 0 015 5v2M3 10l5-5m-5 5l5 5',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  clip: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  external: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
};

const EXAM: { label: string; keys: PhysicalExamKey[] }[] = [
  { label: 'General', keys: ['general'] },
  { label: 'HEENT', keys: ['headEent', 'heent'] },
  { label: 'Chest', keys: ['chest'] },
  { label: 'Lungs', keys: ['lungs'] },
  { label: 'Heart', keys: ['cardiovascular'] },
  { label: 'Abdomen', keys: ['abdomen'] },
  { label: 'Extremities', keys: ['extremities'] },
  { label: 'Skin', keys: ['skin'] },
  { label: 'Lymph nodes', keys: ['lymphNotes'] },
  { label: 'Breast', keys: ['breast'] },
  { label: 'Rectum', keys: ['rectum'] },
  { label: 'Genitalia', keys: ['genitalia'] },
  { label: 'Musculoskeletal', keys: ['musculoskeletal'] },
  { label: 'Neurological', keys: ['neurological', 'neuro'] },
  { label: 'Other', keys: ['other'] },
];

const has = (s?: string | null) => typeof s === 'string' && s.trim() !== '';
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
/** Date-only fields are stored at UTC midnight; read them in UTC so they never slip a day. */
const calendarDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const peso = (n: number) => money(n);
const patientName = (v: Visit) => (v.patient ? `${v.patient.firstName} ${v.patient.lastName}`.trim() : 'Patient record unavailable');

async function readJson(res: Response) {
  return res.json().catch(() => ({ success: false, error: `Request failed (${res.status})` }));
}

/** Data URLs can't be opened as a top-level page, so hand the browser a blob URL instead. */
type Confirm = 'close' | 'cancel' | null;

export default function VisitDetailClient({ visitId, permissions }: { visitId: string; permissions: VisitDetailPermissions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the new-visit form brings the user here; `rx` is the prescription it made.
  const [savedRx, setSavedRx] = useState<string | null>(() => (searchParams.get('saved') === '1' ? searchParams.get('rx') : null));
  const [visit, setVisit] = useState<Visit | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<string | null>(() => (searchParams.get('saved') === '1' ? 'Visit saved.' : null));
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('saved') === '1') window.history.replaceState({}, '', `/visits/${visitId}`);
  }, [searchParams, visitId]);

  const context = useKeyedFetch<VisitContext>(`/api/visits/${visitId}/context`);
  const me = useKeyedFetch<{ name?: string }>(permissions.canUpdate ? '/api/user/me' : null);
  const reloadContext = context.reload;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/visits/${visitId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) return router.push('/login');
        const json = await readJson(res);
        if (!res.ok || !json?.success) {
          setFailure({ status: res.status, message: json?.error || `Request failed (${res.status})` });
          return;
        }
        setVisit(json.data);
        setFailure(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setFailure({ status: 0, message: err instanceof Error ? err.message : 'Request failed' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(version);
      });
    return () => controller.abort();
  }, [visitId, version, router]);

  useEffect(() => {
    // A notice carrying the print link stays until dismissed.
    if (!notice || savedRx) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice, savedRx]);

  const done = useCallback((message: string, next: Visit) => {
    setVisit(next);
    setActionError(null);
    setSavedRx(null);
    setNotice(message);
  }, []);

  const save = useCallback(
    async (body: Record<string, unknown>, fallback: string): Promise<Visit | null> => {
      setActionError(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/visits/${visitId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        const json = await readJson(res);
        if (!res.ok || !json.success) {
          setActionError(formatApiError(json, fallback));
          return null;
        }
        return json.data as Visit;
      } catch {
        setActionError(`${fallback}. Check your connection and try again.`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [visitId, router]
  );

  const changeStatus = async (status: VisitStatus) => {
    setConfirm(null);
    const next = await save({ status }, 'The visit status could not be changed');
    if (!next) return;
    if (status === 'closed') {
      done('Visit closed. Billing and the patient’s visit summary run in the background.', next);
      // The invoice is made after the response; look again once it has had time to land.
      setTimeout(reloadContext, 4000);
    } else if (status === 'cancelled') {
      done('Visit cancelled. The note stays on file.', next);
    } else {
      done(visit?.status === 'cancelled' ? 'Visit restored. It is open again.' : 'Visit reopened.', next);
    }
  };

  const handleUpdate = async (formData: VisitFormData): Promise<boolean> => {
    if (!visit) return false;
    const { _id: _ignored, status: _formStatus, ...fields } = formData;
    void _ignored;
    void _formStatus;
    const promote = visit.status === 'draft';
    const next = await save({ ...fields, ...(promote ? { status: 'open' } : {}) }, 'The note could not be saved');
    if (!next) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    setEditing(false);
    done(promote ? 'Note saved. The visit is now open.' : 'Note saved.', next);
    reloadContext();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleUpload = async (file: File, notes: string): Promise<boolean> => {
    setActionError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      if (notes) body.append('notes', notes);
      const res = await fetch(`/api/visits/${visitId}/upload`, { method: 'POST', body });
      if (res.status === 401) {
        router.push('/login');
        return false;
      }
      const json = await readJson(res);
      if (!res.ok || !json.success) {
        setActionError(formatApiError(json, `${file.name} could not be attached`));
        return false;
      }
      done(`${file.name} is attached to this visit.`, json.data);
      return true;
    } catch {
      setActionError(`${file.name} could not be attached. Check your connection and try again.`);
      return false;
    }
  };

  // --- Not loaded ------------------------------------------------------------

  if (failure && !visit) {
    const missing = failure.status === 404 || failure.status === 400;
    const denied = failure.status === 403;
    return (
      <Shell>
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Visit not found' : denied ? 'You can’t open this visit' : 'This visit didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing
              ? 'It may have been deleted, or it belongs to another clinic.'
              : denied
                ? 'Your role doesn’t include reading visit notes. Ask a clinic admin if you need access.'
                : `${failure.message}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/visits" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All visits
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={() => setVersion((v) => v + 1)} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!visit) {
    return (
      <Shell>
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="h-48 rounded-lg border border-gray-200 bg-white" />
              <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            </div>
            <div className="h-64 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading visit…
        </span>
      </Shell>
    );
  }

  // --- Loaded ----------------------------------------------------------------

  const v = visit;
  const who = patientName(v);
  const cancelled = v.status === 'cancelled';
  const refreshing = settled !== version;
  const canEdit = permissions.canUpdate && !cancelled;
  const followUpDate = v.followUpDate || v.treatmentPlan?.followUp?.date;
  const ctx = context.value;

  return (
    <Shell>
      <Link href="/visits" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
        <Svg d={ICONS.chevL} />
        All visits
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${cancelled ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-900'}`}>{who}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[v.status] ?? STATUS_BADGE.open}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
            <span className="font-mono text-sm text-gray-500">{v.visitCode}</span>
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            {visitTypeLabel(v.visitType)} · {longDate(v.date)} at <span className="font-mono">{clock(v.date)}</span> · {v.provider?.name ?? 'No doctor recorded'}
          </p>
        </div>

        {!editing && (
          <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy || refreshing ? 'opacity-60' : ''}`}>
            {!cancelled && (
              <>
                {permissions.canIssueCertificate && (
                  <>
                    <a
                      href={`/api/visits/${v._id}/print/medical-certificate`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.print} />
                      Medical certificate
                    </a>
                    <PdfLink href={`/api/visits/${v._id}/print/medical-certificate`} label="medical certificate" />
                  </>
                )}
                <a
                  href={`/api/visits/${v._id}/print/lab-request`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                >
                  <Svg d={ICONS.print} />
                  Lab request
                </a>
                <PdfLink href={`/api/visits/${v._id}/print/lab-request`} label="lab request" />
              </>
            )}
            {permissions.canUpdate && (v.status === 'draft' || v.status === 'open') && (
              <button
                type="button"
                onClick={() => setConfirm('close')}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep disabled:cursor-wait ${FOCUS_RING}`}
              >
                <Svg d={ICONS.check} />
                Close visit
              </button>
            )}
            {permissions.canUpdate && (v.status === 'closed' || cancelled) && (
              <button
                type="button"
                onClick={() => changeStatus('open')}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait ${FOCUS_RING}`}
              >
                <Svg d={ICONS.undo} />
                {cancelled ? 'Restore visit' : 'Reopen'}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setEditing(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.pen} />
                {v.status === 'draft' ? 'Finish note' : 'Edit note'}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setConfirm('cancel')}
                disabled={busy}
                aria-label={`Cancel visit ${v.visitCode}`}
                title="Cancel visit"
                className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.x} />
              </button>
            )}
          </div>
        )}
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>
            {notice}
            {savedRx && (
              <>
                {' '}
                A prescription was made from the medicines.{' '}
                <a href={`/api/prescriptions/${savedRx}/print`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 rounded font-semibold underline underline-offset-2 hover:text-green-900 ${FOCUS_RING}`}>
                  <Svg d={ICONS.print} className="h-3.5 w-3.5" />
                  Print prescription
                </a>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setSavedRx(null);
            }}
            aria-label="Dismiss"
            className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}
          >
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

      {editing ? (
        <div className="motion-panel-in" aria-label="Edit the visit note" role="region">
          <VisitForm
            initialData={{
              _id: v._id,
              status: v.status,
              patient: v.patient?._id || '',
              visitType: v.visitType as 'consultation',
              chiefComplaint: v.chiefComplaint,
              historyOfPresentIllness: v.historyOfPresentIllness,
              admittingImpression: v.admittingImpression,
              vitals: v.vitals ?? undefined,
              physicalExam: v.physicalExam,
              diagnoses: v.diagnoses,
              soapNotes: v.soapNotes,
              treatmentPlan: v.treatmentPlan,
              // <input type="date"> takes yyyy-MM-dd.
              followUpDate: v.followUpDate ? v.followUpDate.slice(0, 10) : undefined,
              notes: v.notes,
              digitalSignature: v.digitalSignature ? { providerName: v.digitalSignature.providerName, signatureData: v.digitalSignature.signatureData } : undefined,
            }}
            patients={v.patient ? [{ _id: v.patient._id, firstName: v.patient.firstName, lastName: v.patient.lastName, patientCode: v.patient.patientCode }] : []}
            lockPatientSelection
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
            providerName={me.value?.name || v.provider?.name || 'Attending doctor'}
          />
        </div>
      ) : (
        <div className={`grid items-start gap-6 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ${refreshing ? 'opacity-60' : ''}`}>
          <div className="flex min-w-0 flex-col gap-6">
            <VitalsPanel current={v.vitals} visit={{ _id: v._id, visitCode: v.visitCode, date: v.date, vitals: v.vitals }} history={ctx?.history ?? null} />
            <NotePanel visit={v} canEdit={canEdit} onEdit={() => setEditing(true)} />
            <DiagnosesPanel diagnoses={v.diagnoses} />
            <TreatmentPanel plan={v.treatmentPlan} />
            <AttachmentsPanel visit={v} canUpload={permissions.canUpdate} onUpload={handleUpload} />
          </div>
          <aside className="flex min-w-0 flex-col gap-6">
            <PatientPanel visit={v} permissions={permissions} />
            <OutcomesPanel visit={v} context={ctx} contextError={context.error} onRetry={context.reload} followUpDate={followUpDate} permissions={permissions} />
            <SignaturePanel visit={v} canEdit={canEdit} />
          </aside>
        </div>
      )}

      {confirm &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(open) => !open && setConfirm(null)}
            title={confirm === 'close' ? 'Close this visit?' : 'Cancel this visit?'}
            description={
              confirm === 'close' ? (
                <div className="space-y-2">
                  <p>
                    Closing finishes {who}’s note for {longDate(v.date)}.{' '}
                    {ctx?.invoice ? `Invoice ${ctx.invoice.invoiceNumber} already exists, so no new one is made.` : 'The clinic then makes the invoice for this visit, when automatic invoicing is on in Settings.'} The patient is sent a visit summary by
                    SMS and email.
                    {followUpDate && !v.followUpAppointmentId ? ` The follow-up on ${calendarDate(followUpDate)} is booked as an appointment.` : ''}
                  </p>
                  {!v.digitalSignature && <p className="font-medium text-amber-800">The note isn’t signed yet.</p>}
                </div>
              ) : (
                `${who}, ${longDate(v.date)}. The note stays on file, marked cancelled, and the patient’s current place in the queue is cancelled too. Certificates and lab requests can’t be printed for a cancelled visit.`
              )
            }
          >
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
            >
              {confirm === 'close' ? 'Not yet' : 'Keep visit'}
            </button>
            {confirm === 'close' ? (
              <button type="button" onClick={() => changeStatus('closed')} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Close visit
              </button>
            ) : (
              <button type="button" onClick={() => changeStatus('cancelled')} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
                Cancel visit
              </button>
            )}
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby={id}>
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

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-5 py-3 text-sm font-semibold text-brand-teal-dark transition-colors hover:bg-gray-50 hover:text-brand-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal"
      >
        {label}
        <Svg d={ICONS.arrow} />
      </Link>
    </li>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{children}</p>;
}

// ---------------------------------------------------------------------------
// Main column
// ---------------------------------------------------------------------------

function NotePanel({ visit: v, canEdit, onEdit }: { visit: Visit; canEdit: boolean; onEdit: () => void }) {
  const story = [
    { label: 'Chief complaint', text: v.chiefComplaint },
    { label: 'History of present illness', text: v.historyOfPresentIllness },
  ].filter((s) => has(s.text));
  const soap = [
    { label: 'Subjective', text: v.soapNotes?.subjective },
    { label: 'Objective', text: v.soapNotes?.objective },
    { label: 'Assessment', text: has(v.soapNotes?.assessment) ? v.soapNotes?.assessment : v.assessment },
    { label: 'Plan', text: has(v.soapNotes?.plan) ? v.soapNotes?.plan : v.plan },
  ].filter((s) => has(s.text));
  const exam = EXAM.map((e) => ({ label: e.label, text: e.keys.map((k) => v.physicalExam?.[k]).find(has) })).filter((e) => has(e.text));
  const empty = story.length + soap.length + exam.length === 0 && !has(v.admittingImpression) && !has(v.notes);

  return (
    <Panel
      id="visit-note"
      title="Note"
      aside={v.updatedAt ? <span className="text-sm text-gray-500">Saved <span className="font-mono">{longDate(v.updatedAt).replace(/^\w+, /, '')}, {clock(v.updatedAt)}</span></span> : null}
    >
      {empty ? (
        <div className="px-5 py-10 text-center">
          <p className="font-semibold text-gray-900">Nothing written yet</p>
          <p className="mt-1 text-sm text-gray-500">The complaint, SOAP notes and examination appear here once they’re written.</p>
          {canEdit && (
            <button type="button" onClick={onEdit} className={`mt-5 inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.pen} />
              Write the note
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {story.map((s) => (
            <div key={s.label} className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">{s.label}</h3>
              <Prose>{s.text}</Prose>
            </div>
          ))}
          {soap.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="sr-only">SOAP notes</h3>
              <dl className="space-y-4">
                {soap.map((s) => (
                  <div key={s.label}>
                    <dt className="text-sm font-semibold text-gray-900">{s.label}</dt>
                    <dd>
                      <Prose>{s.text}</Prose>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {exam.length > 0 && (
            <div className="py-3">
              <h3 className="px-5 pb-1 pt-1 text-sm font-semibold text-gray-900">Physical examination</h3>
              <dl className="divide-y divide-gray-100">
                {exam.map((e) => (
                  <div key={e.label} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-gray-500">{e.label}</dt>
                    <dd className="whitespace-pre-wrap text-gray-700">{e.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {has(v.admittingImpression) && (
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Admitting impression</h3>
              <Prose>{v.admittingImpression}</Prose>
            </div>
          )}
          {has(v.notes) && (
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Other notes</h3>
              <Prose>{v.notes}</Prose>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function DiagnosesPanel({ diagnoses }: { diagnoses: Visit['diagnoses'] }) {
  const list = [...(diagnoses ?? [])].filter((d) => has(d.code) || has(d.description)).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  return (
    <Panel id="visit-dx" title="Diagnoses" aside={list.length > 0 ? <span className="font-mono text-sm text-gray-500">{list.length}</span> : null}>
      {list.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No diagnosis recorded.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {list.map((d, i) => (
            <li key={`${d.code}-${i}`} className="flex items-baseline gap-3 px-5 py-3 text-sm">
              <span className="w-16 shrink-0 font-mono text-xs font-semibold text-gray-900">{d.code || '—'}</span>
              <span className="min-w-0 flex-1 text-gray-700">{d.description || <span className="text-gray-400">No description</span>}</span>
              {d.primary && <span className="shrink-0 rounded bg-brand-teal-light px-2 py-0.5 text-xs font-semibold text-brand-teal-deep ring-1 ring-inset ring-brand-teal/30">Primary</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TreatmentPanel({ plan }: { plan: Visit['treatmentPlan'] }) {
  const meds = (plan?.medications ?? []).filter((m) => has(m.name));
  const procs = (plan?.procedures ?? []).filter((p) => has(p.name));
  const advice = (plan?.lifestyle ?? []).filter((l) => has(l.instructions));
  if (meds.length + procs.length + advice.length === 0) return null;

  return (
    <Panel id="visit-plan" title="Treatment plan">
      <div className="divide-y divide-gray-100">
        {meds.length > 0 && (
          <PlanGroup title="Medicines">
            {meds.map((m, i) => (
              <li key={`${m.name}-${i}`} className="px-5 py-3 text-sm">
                <p className="font-semibold text-gray-900">{m.name}</p>
                <p className="mt-0.5 text-gray-600">
                  {[m.dosage, m.frequency, m.duration].filter(has).join(' · ')}
                  {m.quantity ? (
                    <>
                      {' · '}
                      <span className="font-mono">{m.quantity}</span> to dispense
                    </>
                  ) : null}
                </p>
                {has(m.instructions) && <p className="mt-1 text-gray-500">{m.instructions}</p>}
              </li>
            ))}
          </PlanGroup>
        )}
        {procs.length > 0 && (
          <PlanGroup title="Procedures">
            {procs.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-gray-900">{p.name}</span>
                  {has(p.description) && <span className="mt-0.5 block text-gray-600">{p.description}</span>}
                </span>
                {p.scheduledDate && <span className="font-mono text-xs text-gray-600">{calendarDate(p.scheduledDate)}</span>}
              </li>
            ))}
          </PlanGroup>
        )}
        {advice.length > 0 && (
          <PlanGroup title="Advice">
            {advice.map((l, i) => (
              <li key={`${l.category}-${i}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                <span className="capitalize text-gray-500">{l.category || 'General'}</span>
                <span className="whitespace-pre-wrap text-gray-700">{l.instructions}</span>
              </li>
            ))}
          </PlanGroup>
        )}
      </div>
    </Panel>
  );
}

function PlanGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <h3 className="px-5 pt-2 text-sm font-semibold text-gray-900">{title}</h3>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </div>
  );
}

function AttachmentsPanel({ visit: v, canUpload, onUpload }: { visit: Visit; canUpload: boolean; onUpload: (file: File, notes: string) => Promise<boolean> }) {
  const files = v.attachments ?? [];
  return (
    <Panel id="visit-files" title="Images and files" aside={files.length > 0 ? <span className="font-mono text-sm text-gray-500">{files.length}</span> : null}>
      {files.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No images or files attached{canUpload ? '. Attach X-rays, wound photos or outside results below.' : '.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {files.map((f, i) => {
            // Files open through the visit's file route, which checks access and logs each opening.
            const href = f._id ? `/api/visits/${v._id}/files/${f._id}` : null;
            const image = Boolean(href && f.contentType?.startsWith('image/'));
            return (
              <li key={f._id || i} className="motion-row-in flex items-center gap-4 px-5 py-3" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 text-gray-500">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the app's file route, not a static asset
                    <img src={href!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Svg d={ICONS.doc} className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900" title={f.filename}>
                    {f.filename}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    <span className="font-mono text-xs">
                      {new Date(f.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {f.size ? ` · ${fileSize(f.size)}` : ''}
                    </span>
                    {has(f.notes) && <> · {f.notes}</>}
                  </span>
                </span>
                {href && (
                  <span className="flex shrink-0 items-center gap-1">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${f.filename}`}
                      title="Open in a new tab"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.external} />
                    </a>
                    <a
                      href={`${href}?download=1`}
                      aria-label={`Download ${f.filename}`}
                      title="Download"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.download} />
                    </a>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canUpload && <AttachForm onUpload={onUpload} />}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Side column
// ---------------------------------------------------------------------------

function PatientPanel({ visit: v, permissions }: { visit: Visit; permissions: VisitDetailPermissions }) {
  return (
    <Panel id="visit-patient" title="Patient">
      {v.patient ? (
        <>
          <dl className="divide-y divide-gray-100">
            {v.patient.patientCode && (
              <Field label="Patient ID">
                <span className="font-mono">{v.patient.patientCode}</span>
              </Field>
            )}
            <Field label="Phone">{has(v.patient.phone) ? <span className="font-mono">{v.patient.phone}</span> : <span className="text-gray-400">Not on file</span>}</Field>
            <Field label="Email">{has(v.patient.email) ? v.patient.email : <span className="text-gray-400">Not on file</span>}</Field>
          </dl>
          {(permissions.canSeePatient || permissions.canBook) && (
            <ul className="border-t border-gray-200 divide-y divide-gray-100">
              {permissions.canSeePatient && <LinkRow href={`/patients/${v.patient._id}`} label="Open patient record" />}
              {permissions.canBook && <LinkRow href={`/appointments/new?patientId=${v.patient._id}`} label="Book an appointment" />}
            </ul>
          )}
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-gray-500">The patient record is no longer linked to this clinic.</p>
      )}
    </Panel>
  );
}

function OutcomesPanel({
  visit: v,
  context: ctx,
  contextError,
  onRetry,
  followUpDate,
  permissions,
}: {
  visit: Visit;
  context: VisitContext | null;
  contextError: string | null;
  onRetry: () => void;
  followUpDate?: string;
  permissions: VisitDetailPermissions;
}) {
  const followUpNote = v.treatmentPlan?.followUp?.instructions;
  const reminded = v.followUpReminderSent || v.treatmentPlan?.followUp?.reminderSent;

  return (
    <Panel id="visit-outcomes" title="From this visit">
      {contextError && !ctx ? (
        <div className="flex items-start justify-between gap-3 px-5 py-4 text-sm">
          <p className="text-gray-600">Orders and billing didn’t load.</p>
          <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1.5 rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      ) : !ctx ? (
        <div className="animate-pulse space-y-3 px-5 py-4" aria-hidden="true">
          <div className="h-4 w-3/4 rounded bg-gray-100" />
          <div className="h-4 w-1/2 rounded bg-gray-100" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {ctx.access.prescriptions && (
            <OutcomeGroup title="Prescriptions" empty={ctx.prescriptions?.length ? null : 'None. Saving the note with medicines makes one.'}>
              {ctx.prescriptions?.map((p) => (
                <OutcomeRow
                  key={p._id}
                  href={`/prescriptions/${p._id}`}
                  code={p.prescriptionCode}
                  title={(p.medications ?? []).map((m) => m.name).filter(Boolean).join(', ') || 'No medicines listed'}
                  state={RX_LABEL[p.status] ?? p.status}
                />
              ))}
            </OutcomeGroup>
          )}
          {ctx.access.labs && (
            <OutcomeGroup title="Lab tests" empty={ctx.labs?.length ? null : 'None ordered.'}>
              {ctx.labs?.map((l) => (
                <OutcomeRow
                  key={l._id}
                  href={`/lab-results/${l._id}`}
                  code={l.requestCode}
                  title={`${l.request?.testType || 'Lab test'}${l.request?.urgency && l.request.urgency !== 'routine' ? ` · ${l.request.urgency === 'stat' ? 'STAT' : 'Urgent'}` : ''}`}
                  state={LAB_LABEL[l.status] ?? l.status}
                />
              ))}
            </OutcomeGroup>
          )}
          {ctx.access.invoices && (
            <OutcomeGroup title="Invoice" empty={ctx.invoice ? null : v.status === 'closed' ? 'Not made. Automatic invoicing may be off in Settings.' : 'Made when the visit is closed.'}>
              {ctx.invoice && (
                <OutcomeRow
                  href={`/invoices/${ctx.invoice._id}`}
                  code={ctx.invoice.invoiceNumber}
                  title={
                    typeof ctx.invoice.total === 'number' ? (
                      <>
                        <span className="font-mono">{peso(ctx.invoice.total)}</span>
                        {ctx.invoice.outstandingBalance && ctx.invoice.status !== 'paid' ? (
                          <span className="text-gray-500">
                            {' · '}
                            <span className="font-mono">{peso(ctx.invoice.outstandingBalance)}</span> due
                          </span>
                        ) : null}
                      </>
                    ) : (
                      'Invoice'
                    )
                  }
                  state={INVOICE_LABEL[ctx.invoice.status] ?? ctx.invoice.status}
                />
              )}
            </OutcomeGroup>
          )}
          <OutcomeGroup title="Follow-up" empty={followUpDate ? null : 'None planned.'}>
            {followUpDate && (
              <li className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-mono font-semibold text-gray-900">{calendarDate(followUpDate)}</span>
                  <span className="text-xs font-medium text-gray-600">
                    {v.followUpAppointmentId ? 'Booked' : v.status === 'closed' ? 'Not booked' : 'Booked when the visit closes'}
                    {reminded ? ' · reminder sent' : ''}
                  </span>
                </p>
                {has(followUpNote) && <p className="mt-1 whitespace-pre-wrap text-gray-600">{followUpNote}</p>}
                {v.followUpAppointmentId && permissions.canSeeAppointments && (
                  <Link href={`/appointments/${v.followUpAppointmentId}`} className={`mt-1.5 inline-flex items-center gap-1 rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Open the appointment
                    <Svg d={ICONS.arrow} className="h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            )}
          </OutcomeGroup>
        </div>
      )}
    </Panel>
  );
}

function OutcomeGroup({ title, empty, children }: { title: string; empty: string | null; children: ReactNode }) {
  return (
    <div className="py-2">
      <h3 className="px-5 pt-2 text-sm font-semibold text-gray-900">{title}</h3>
      {empty ? <p className="px-5 pb-2 pt-1 text-sm text-gray-500">{empty}</p> : <ul className="divide-y divide-gray-100">{children}</ul>}
    </div>
  );
}

function OutcomeRow({ href, code, title, state }: { href: string; code?: string; title: ReactNode; state: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-gray-900">{title}</span>
          <span className="block truncate text-gray-500">
            {code && <span className="font-mono text-xs">{code} · </span>}
            {state}
          </span>
        </span>
        <span className="text-gray-400 transition-colors group-hover:text-gray-700" aria-hidden="true">
          <Svg d={ICONS.chevR} />
        </span>
      </Link>
    </li>
  );
}

function SignaturePanel({ visit: v, canEdit }: { visit: Visit; canEdit: boolean }) {
  const sig = v.digitalSignature;
  return (
    <Panel id="visit-signature" title="Signature">
      {sig && has(sig.signatureData) ? (
        <div className="px-5 py-4">
          <div className="rounded-md border border-gray-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- signature stored inline as a data URL */}
            <img src={sig.signatureData} alt={`Signature of ${sig.providerName}`} className="mx-auto block h-16 max-w-full object-contain" />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-900">{sig.providerName}</p>
          {sig.signedAt && (
            <p className="text-sm text-gray-500">
              Signed <span className="font-mono">{longDate(sig.signedAt).replace(/^\w+, /, '')}, {clock(sig.signedAt)}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-gray-500">Not signed yet.{canEdit ? ' Sign it at the end of the note.' : ''}</p>
      )}
    </Panel>
  );
}
