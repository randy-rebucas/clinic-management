'use client';

import { useEffect, useId, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { FieldError, Label, NoteArea, Section } from './visits/form/parts';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { formatApiError } from './utils/apiError';
import { DETAIL_FIELDS, DetailFields, HAS_EXPIRY, detailsPayload } from './documents/fields';
import { CATEGORY_LABEL, DOCUMENT_CATEGORY_KEYS, fileSize, type DocumentCategory } from '@/lib/documents';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx';
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

interface VisitOption {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

/** A filename's guess at its kind, as the server would infer it, so the form starts right. */
function guessCategory(name: string): DocumentCategory | '' {
  const n = name.toLowerCase();
  if (/refer/.test(n)) return 'referral';
  if (/\blab|cbc|urinalysis|fbs|lipid/.test(n)) return 'laboratory_result';
  if (/x-?ray|ultrasound|\bct\b|mri|imaging/.test(n)) return 'imaging';
  if (/cert/.test(n)) return 'medical_certificate';
  if (/philhealth|hmo|insurance|maxicare|intellicare/.test(n)) return 'insurance';
  if (/receipt|invoice|bill/.test(n)) return 'invoice';
  return '';
}

const titleFrom = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();

/**
 * Upload one document. File, then what it is (kind and its details), whose it is (a server-side
 * patient search and that patient's visits), and who may see it: a patient's documents appear in
 * their patient portal unless marked staff only, and the form says so before saving.
 */
export default function DocumentUploadForm({ maxBytes, initialPatient, initialVisitId }: { maxBytes: number; initialPatient: PatientOption | null; initialVisitId?: string }) {
  const ids = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState('');
  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [visitId, setVisitId] = useState(initialVisitId ?? '');
  const [staffOnly, setStaffOnly] = useState(false);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [scanned, setScanned] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const visits = useKeyedFetch<VisitOption[]>(patient ? `/api/visits?patientId=${patient._id}&limit=20` : null);
  const patientVisits = visits.valueUrl?.includes(patient?._id ?? '#') ? (visits.value ?? []) : [];

  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const dirty = Boolean(file) || title.trim() !== '' || notes.trim() !== '';
  useUnsavedChanges(dirty && !busy, 'This document is not uploaded yet. Leave anyway?');

  const take = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setFailure(null);
    if (!titleTouched || !title.trim()) setTitle(titleFrom(f.name));
    if (!category) setCategory(guessCategory(f.name));
  };

  // --- Problems ------------------------------------------------------------------

  const fileProblem = !file
    ? 'Choose the file to upload.'
    : file.size > maxBytes
      ? `This file is ${fileSize(file.size)}; the limit is ${fileSize(maxBytes)}. Scan at a lower resolution or split it.`
      : file.type && !ACCEPTED_TYPES.has(file.type)
        ? 'Only PDF, JPG, PNG, GIF, WebP, Word and Excel files can be uploaded.'
        : null;
  const problems = {
    file: fileProblem,
    title: title.trim() ? null : 'Give the document a title.',
    category: category ? null : 'Choose what kind of document this is.',
  };
  const problemCount = Object.values(problems).filter(Boolean).length;
  const err = (k: keyof typeof problems) => (attempted ? problems[k] : null);

  // --- Submit --------------------------------------------------------------------------

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-upload-form] [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure(null);
    const body = new FormData();
    body.append('file', file!);
    body.append('title', title.trim());
    body.append('category', category);
    if (patient) body.append('patientId', patient._id);
    if (patient && visitId) body.append('visitId', visitId);
    if (notes.trim()) body.append('notes', notes.trim());
    if (tags.trim()) body.append('tags', tags.trim());
    body.append('scanned', String(scanned));
    body.append('confidential', String(staffOnly));
    if (HAS_EXPIRY.has(category as DocumentCategory) && expiry) body.append('expiryDate', expiry);
    const extra = detailsPayload(category as DocumentCategory, details);
    if (extra) body.append(DETAIL_FIELDS[category as DocumentCategory]!.formKey, JSON.stringify(extra));

    try {
      const res = await fetch('/api/documents', { method: 'POST', body });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFailure(formatApiError(json, 'The document could not be uploaded'));
        setBusy(false);
        return;
      }
      router.push(`/documents/${json.data._id}?saved=uploaded`);
    } catch {
      setFailure('The server couldn’t be reached. Nothing was uploaded; try again.');
      setBusy(false);
    }
  };

  const name = patient ? `${patient.firstName} ${patient.lastName}` : null;
  const status = busy
    ? `Uploading ${file ? fileSize(file.size) : ''}…`
    : attempted && problemCount
      ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing.`
      : !file
        ? 'Choose a file to upload.'
        : name
          ? staffOnly
            ? `Files it to ${name}’s record, for staff only.`
            : `Files it to ${name}’s record. ${patient!.firstName} can see it in the patient portal.`
          : 'Uploads it without a patient; it waits under “Not filed to a patient”.';

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  };

  return (
    <form data-upload-form onSubmit={submit} noValidate autoComplete="off" className="flex flex-col gap-6">
      {failure && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{failure}</p>
          <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      <Section id={`${ids}-file`} title="File" hint={`PDF, image, Word or Excel, up to ${fileSize(maxBytes)}.`}>
        <div className="px-5 py-4">
          <label
            htmlFor={`${ids}-input`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-2 ${
              dragging ? 'border-brand-teal-dark bg-brand-teal-light/50' : err('file') ? 'border-red-400 bg-red-50/40' : 'border-gray-300 hover:border-brand-teal-dark hover:bg-brand-teal-light/30'
            }`}
          >
            <input
              id={`${ids}-input`}
              type="file"
              accept={ACCEPT}
              onChange={(e) => take(e.target.files?.[0])}
              aria-invalid={Boolean(err('file'))}
              aria-describedby={err('file') ? `${ids}-file-err` : undefined}
              className="sr-only"
            />
            {file ? (
              <>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
                  <img src={preview} alt="" className="max-h-40 rounded-md object-contain ring-1 ring-gray-200" />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                    <Svg d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="h-5 w-5" />
                  </span>
                )}
                <span className="max-w-full truncate text-sm font-semibold text-gray-900">{file.name}</span>
                <span className="font-mono text-xs text-gray-500">{fileSize(file.size)}</span>
                <span className="text-sm font-semibold text-brand-teal-dark">Choose a different file</span>
              </>
            ) : (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
                  <Svg d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900">Drop the file here, or choose one</span>
                <span className="text-xs text-gray-500">A phone photo of a paper result works too.</span>
              </>
            )}
          </label>
          {err('file') && <FieldError id={`${ids}-file-err`}>{err('file')}</FieldError>}
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={scanned} onChange={(e) => setScanned(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            It is a scan or photo of a paper document
          </label>
        </div>
      </Section>

      <Section id={`${ids}-what`} title="What it is">
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor={`${ids}-title`}>Title</Label>
            <input
              id={`${ids}-title`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              maxLength={300}
              placeholder="e.g. Chest X-ray result, St. Luke’s"
              aria-invalid={Boolean(err('title'))}
              className={`${FIELD} ${err('title') ? 'border-red-400' : ''}`}
            />
            {err('title') ? <FieldError id={`${ids}-title-err`}>{err('title')}</FieldError> : <p className="mt-1.5 text-xs text-gray-500">How it reads in lists and on the patient’s record.</p>}
          </div>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Kind</legend>
            <div className="flex flex-wrap gap-1.5">
              {DOCUMENT_CATEGORY_KEYS.map((c, i) => (
                <label
                  key={c}
                  className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-900 has-[:checked]:border-brand-teal-dark has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                >
                  <input
                    type="radio"
                    name={`${ids}-cat`}
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                    aria-invalid={i === 0 && Boolean(err('category')) ? true : undefined}
                    aria-describedby={err('category') ? `${ids}-cat-err` : undefined}
                    className="sr-only"
                  />
                  {CATEGORY_LABEL[c]}
                </label>
              ))}
            </div>
            {err('category') && <FieldError id={`${ids}-cat-err`}>{err('category')}</FieldError>}
          </fieldset>
          {category && DETAIL_FIELDS[category] && (
            <div className="motion-panel-in border-t border-gray-100 pt-4">
              <DetailFields category={category} values={details} onChange={(k, v) => setDetails((d) => ({ ...d, [k]: v }))} idPrefix={ids} />
              {category === 'medical_certificate' && <p className="mt-2 text-xs text-gray-500">“Valid until” sets the expiry: the clinic is reminded before it runs out.</p>}
            </div>
          )}
          {category && HAS_EXPIRY.has(category) && (
            <div className="motion-panel-in max-w-xs border-t border-gray-100 pt-4">
              <Label htmlFor={`${ids}-exp`} optional>
                Valid until
              </Label>
              <input id={`${ids}-exp`} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`${FIELD} font-mono`} />
              <p className="mt-1.5 text-xs text-gray-500">The clinic is reminded before it runs out.</p>
            </div>
          )}
        </div>
      </Section>

      <Section id={`${ids}-whose`} title="Whose it is" hint="File it to the patient it is about. A visit links it to that consultation too.">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <PatientSearch
            optional
            value={patient}
            onChange={(p) => {
              setPatient(p);
              setVisitId('');
            }}
          />
          <div>
            <Label htmlFor={`${ids}-visit`} optional>
              Visit
            </Label>
            <select id={`${ids}-visit`} value={visitId} onChange={(e) => setVisitId(e.target.value)} disabled={!patient || patientVisits.length === 0} className={FIELD}>
              <option value="">{!patient ? 'Choose the patient first' : visits.loading ? 'Loading visits…' : patientVisits.length === 0 ? 'No visits on file' : 'Not about a visit'}</option>
              {patientVisits.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.visitCode} · {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {v.visitType ? ` · ${v.visitType.replace(/-/g, ' ')}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section id={`${ids}-who`} title="Who can see it">
        <div className="space-y-3 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            <span>
              <span className="font-medium text-gray-900">Staff only</span>
              <span className="block text-gray-500">Keep it out of the patient’s portal. Use it for internal letters and anything not meant for the patient.</span>
            </span>
          </label>
          <p className={`text-sm ${patient && !staffOnly ? 'text-brand-teal-deep' : 'text-gray-500'}`}>
            {patient
              ? staffOnly
                ? `${patient.firstName} won’t see it. Staff who may read documents will.`
                : `${patient.firstName} will see it in the patient portal, with its title.`
              : 'Without a patient, only staff see it.'}
          </p>
        </div>
      </Section>

      <Section id={`${ids}-notes`} title="Notes">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${ids}-n`} optional>
              Notes for staff
            </Label>
            <NoteArea id={`${ids}-n`} rows={2} value={notes} onChange={setNotes} />
          </div>
          <div>
            <Label htmlFor={`${ids}-tags`} optional>
              Tags
            </Label>
            <input id={`${ids}-tags`} value={tags} onChange={(e) => setTags(e.target.value)} maxLength={500} placeholder="e.g. follow-up, pre-employment" className={FIELD} />
            <p className="mt-1.5 text-xs text-gray-500">Separate with commas. Search finds documents by tag.</p>
          </div>
        </div>
      </Section>

      <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${attempted && problemCount && !busy ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
          {status}
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm('Discard this upload?')) return;
              router.push(initialPatient ? `/patients/${initialPatient._id}` : '/documents');
            }}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Svg d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </form>
  );
}
