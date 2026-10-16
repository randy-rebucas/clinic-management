'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import EditDialog, { type DocumentDetail } from './documents/EditDialog';
import { DETAIL_FIELDS } from './documents/fields';
import { ExpiryLine, KindMark, clock, shortDate } from './documents/shared';
import { KIND_LABEL, categoryLabel, daysUntil, expiryOf, fileSize, type DocumentCategory } from '@/lib/documents';
import type { DocumentPermissions } from '@/lib/documents-page';

const ICONS = {
  ...ICON,
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

type Dialog = { kind: 'edit'; focus?: 'patient' } | { kind: 'delete' } | null;

export default function DocumentDetailClient({ documentId, permissions, uploaded }: { documentId: string; permissions: DocumentPermissions; uploaded: boolean }) {
  const router = useRouter();
  const res = useKeyedFetch<DocumentDetail>(`/api/documents/${documentId}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(uploaded ? 'Uploaded.' : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = res.value;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!d && res.error) {
    const missing = /not found/i.test(res.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Document not found' : 'This document didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{missing ? 'It may have been deleted, or it belongs to another clinic.' : `${res.error}. Check your connection and try again.`}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/documents" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All documents
            </Link>
            {!missing && (
              <button type="button" onClick={res.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!d) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-72 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-[28rem] rounded-lg border border-gray-200 bg-white" />
            <div className="h-64 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading the document…
        </span>
      </Shell>
    );
  }

  const archived = d.status === 'archived';
  const expiry = expiryOf(d);
  const left = expiry ? daysUntil(String(expiry)) : null;
  const stream = `/api/documents/${d._id}/stream`;
  const patientName = d.patient ? `${d.patient.firstName} ${d.patient.lastName}` : null;

  const done = (message: string) => {
    setDialog(null);
    setActionError(null);
    setNotice(message);
    res.reload();
  };

  const update = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/documents/${d._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(formatApiError(json, 'The change could not be saved'));
      done(message);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The change could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setDialog(null);
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/documents/${d._id}`, { method: 'DELETE' });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(formatApiError(json, 'The document could not be deleted'));
      router.push(d.patient ? `/patients/${d.patient._id}` : '/documents');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The document could not be deleted');
      setBusy(false);
    }
  };

  const detailDef = DETAIL_FIELDS[d.category as DocumentCategory];
  const detailGroup = detailDef ? ((d as unknown as Record<string, Record<string, string | undefined> | null | undefined>)[detailDef.group] ?? null) : null;
  const detailRows = detailDef && detailGroup ? detailDef.fields.filter((f) => detailGroup[f.key]) : [];

  return (
    <Shell>
      <BackLink patient={d.patient ?? null} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <KindMark kind={d.documentType} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 break-words">{d.title}</h1>
              {archived && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">Archived</span>}
              {d.isConfidential && <span className="rounded px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">Staff only</span>}
              <span className="font-mono text-sm text-gray-500">{d.documentCode}</span>
            </div>
            <p className="mt-1 text-sm sm:text-base text-gray-600">
              {categoryLabel(d.category)} · {KIND_LABEL[d.documentType] ?? 'File'}, <span className="font-mono">{fileSize(d.size)}</span> · added <span className="font-mono">{shortDate(d.uploadDate)}</span>
              {d.uploadedBy?.name && ` by ${d.uploadedBy.name}`}
            </p>
          </div>
        </div>
        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          <a href={`/api/documents/${d._id}/view`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.eye} />
            Open
          </a>
          <a href={`/api/documents/${d._id}/download`} className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.download} />
            Download
          </a>
          {permissions.canEdit && (
            <>
              <button
                type="button"
                onClick={() => update({ status: archived ? 'active' : 'archived' }, archived ? 'Back in use.' : 'Archived. It stays on file but leaves the main list.')}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.archive} />
                {archived ? 'Restore' : 'Archive'}
              </button>
              <button type="button" onClick={() => setDialog({ kind: 'edit' })} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                <Svg d={ICONS.edit} />
                Edit details
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'delete' })}
                disabled={busy}
                aria-label={`Delete ${d.title}`}
                title="Delete document"
                className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.trash} />
              </button>
            </>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 ${FOCUS_RING}`}>
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
      {!d.patient && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
            Not filed to a patient, so it isn’t on anyone’s record yet.
          </p>
          {permissions.canEdit && (
            <button type="button" onClick={() => setDialog({ kind: 'edit', focus: 'patient' })} className={`shrink-0 rounded-md border border-amber-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-amber-900 hover:border-amber-700 ${FOCUS_RING}`}>
              File to a patient
            </button>
          )}
        </div>
      )}
      {left !== null && left <= 30 && (
        <div role={left < 0 ? 'alert' : undefined} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${left < 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {left < 0 ? (
              <>
                This {categoryLabel(d.category).toLowerCase()} expired on <span className="font-mono font-semibold">{shortDate(String(expiry))}</span>.
                {patientName && ` Ask ${d.patient!.firstName} for a current one.`}
              </>
            ) : (
              <>
                This {categoryLabel(d.category).toLowerCase()} {left === 0 ? 'expires today' : (
                  <>
                    expires in <span className="font-mono font-semibold">{left}</span> {left === 1 ? 'day' : 'days'}
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="doc-preview" title="Preview" aside={<span className="text-sm text-gray-500">Opening it is recorded in the audit log</span>}>
            {d.documentType === 'image' ? (
              <div className="flex justify-center bg-gray-50 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- streamed from the authenticated route */}
                <img src={stream} alt={d.title} className="max-h-[36rem] max-w-full rounded-md object-contain ring-1 ring-gray-200" />
              </div>
            ) : d.documentType === 'pdf' ? (
              <iframe src={stream} title={`Preview of ${d.title}`} className="block h-[36rem] w-full bg-gray-50" />
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-600">{KIND_LABEL[d.documentType] ?? 'This file'}s don’t preview in the browser.</p>
                <a href={`/api/documents/${d._id}/download`} className={`mt-4 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
                  <Svg d={ICONS.download} />
                  Download to open it
                </a>
              </div>
            )}
          </Panel>

          {detailRows.length > 0 && (
            <Panel id="doc-details" title={`${categoryLabel(d.category)} details`}>
              <dl className="divide-y divide-gray-100">
                {detailRows.map((f) => (
                  <Field key={f.key} label={f.label}>
                    {f.kind === 'date' ? <span className="font-mono">{shortDate(detailGroup![f.key]!)}</span> : <span className="whitespace-pre-wrap">{detailGroup![f.key]}</span>}
                  </Field>
                ))}
              </dl>
            </Panel>
          )}

          {(d.notes || d.description) && (
            <Panel id="doc-notes" title="Notes">
              {d.description && <p className="max-w-prose whitespace-pre-wrap px-5 pt-4 text-sm leading-relaxed text-gray-700">{d.description}</p>}
              {d.notes && <p className="max-w-prose whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-700">{d.notes}</p>}
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="doc-belongs" title="Belongs to">
            <dl className="divide-y divide-gray-100">
              <Field label="Patient">
                {d.patient ? (
                  <Link href={`/patients/${d.patient._id}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {patientName}
                    {d.patient.patientCode && <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{d.patient.patientCode}</span>}
                  </Link>
                ) : (
                  <span className="font-medium text-amber-800">Not filed</span>
                )}
              </Field>
              {d.visit && (
                <Field label="Visit">
                  <Link href={`/visits/${d.visit._id}`} className={`rounded font-mono text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {d.visit.visitCode}
                  </Link>
                  {d.visit.date && <span className="text-gray-500"> · {shortDate(d.visit.date)}</span>}
                </Field>
              )}
              {d.appointment && (
                <Field label="Appointment">
                  <Link href={`/appointments/${d.appointment._id}`} className={`rounded font-mono text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {d.appointment.appointmentCode}
                  </Link>
                </Field>
              )}
              {d.labResult && (
                <Field label="Lab request">
                  <Link href={`/lab-results/${d.labResult._id}`} className={`rounded font-mono text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {d.labResult.requestCode}
                  </Link>
                </Field>
              )}
              {d.invoice && (
                <Field label="Invoice">
                  <Link href={`/invoices/${d.invoice._id}`} className={`rounded font-mono text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {d.invoice.invoiceNumber}
                  </Link>
                </Field>
              )}
              {expiry && (
                <Field label="Valid until">
                  <ExpiryLine iso={String(expiry)} />
                </Field>
              )}
            </dl>
          </Panel>

          <Panel id="doc-who" title="Who can see it">
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-gray-700">
                {d.isConfidential
                  ? 'Staff only. It is kept out of the patient’s portal.'
                  : d.patient
                    ? archived
                      ? `Archived, so ${d.patient.firstName} doesn’t see it in the patient portal now.`
                      : `${d.patient.firstName} can see it in the patient portal.`
                    : 'Only staff, until it is filed to a patient.'}
              </p>
              <p className="text-gray-500">Staff who may read documents can open it; each opening and download is recorded.</p>
              {permissions.canEdit && (
                <button
                  type="button"
                  onClick={() => update({ isConfidential: !d.isConfidential }, d.isConfidential ? 'The patient can see it again.' : 'Now staff only.')}
                  disabled={busy}
                  className={`rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-60 ${FOCUS_RING}`}
                >
                  {d.isConfidential ? 'Let the patient see it' : 'Make it staff only'}
                </button>
              )}
            </div>
          </Panel>

          <Panel id="doc-file" title="File">
            <dl className="divide-y divide-gray-100">
              <Field label="Name">{d.originalFilename || d.filename || '—'}</Field>
              <Field label="Type">
                {KIND_LABEL[d.documentType] ?? 'File'}
                {d.scanned && <span className="text-gray-500"> · scanned</span>}
              </Field>
              <Field label="Size">
                <span className="font-mono">{fileSize(d.size)}</span>
              </Field>
              <Field label="Added">
                <span className="font-mono">
                  {shortDate(d.uploadDate)}, {clock(d.uploadDate)}
                </span>
                {d.uploadedBy?.name && <span className="text-gray-500"> · {d.uploadedBy.name}</span>}
              </Field>
              {d.lastModifiedDate && (
                <Field label="Changed">
                  <span className="font-mono">
                    {shortDate(d.lastModifiedDate)}, {clock(d.lastModifiedDate)}
                  </span>
                  {d.lastModifiedBy?.name && <span className="text-gray-500"> · {d.lastModifiedBy.name}</span>}
                </Field>
              )}
              {d.tags && d.tags.length > 0 && (
                <Field label="Tags">
                  <span className="flex flex-wrap gap-1">
                    {d.tags.map((t) => (
                      <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                        {t}
                      </span>
                    ))}
                  </span>
                </Field>
              )}
            </dl>
          </Panel>
        </aside>
      </div>

      {dialog?.kind === 'edit' && <EditDialog doc={d} focus={dialog.focus} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'delete' &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Delete ${d.title}?`}
            description={
              <>
                <p>The file is removed for good{patientName ? ` and leaves ${patientName}’s record and patient portal` : ''}. A note that it existed, and who deleted it, stays in the audit log.</p>
                <p className="mt-2">To keep it but take it out of daily use, archive it instead.</p>
              </>
            }
          >
            <button type="button" onClick={() => setDialog(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep it
            </button>
            <button type="button" onClick={remove} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Delete document
            </button>
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink({ patient }: { patient?: { _id: string; firstName: string; lastName: string } | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link href="/documents" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
        <Svg d={ICON.chevL} />
        All documents
      </Link>
      {patient && (
        <Link href={`/patients/${patient._id}`} className={`rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          {patient.firstName} {patient.lastName}’s record
        </Link>
      )}
    </div>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-gray-200 px-5 py-4">
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
