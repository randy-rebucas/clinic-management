'use client';

import { useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label, NoteArea } from '../visits/form/parts';
import PatientSearch, { type PatientOption } from '../patients/PatientSearch';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { formatApiError } from '../utils/apiError';
import { DETAIL_FIELDS, DetailFields, HAS_EXPIRY, dateInput } from './fields';
import type { DocumentRow } from './shared';
import { CATEGORY_LABEL, DOCUMENT_CATEGORY_KEYS, type DocumentCategory } from '@/lib/documents';

export type DocumentDetail = DocumentRow & {
  notes?: string;
  referral?: Record<string, string | undefined> | null;
  imaging?: Record<string, string | undefined> | null;
  labResultMetadata?: Record<string, string | undefined> | null;
  appointment?: { _id: string; appointmentCode: string } | null;
  labResult?: { _id: string; requestCode: string } | null;
  invoice?: { _id: string; invoiceNumber: string } | null;
  lastModifiedBy?: { _id: string; name: string } | null;
  lastModifiedDate?: string;
};

const groupOf = (d: DocumentDetail, category: DocumentCategory): Record<string, unknown> | null | undefined => {
  const g = DETAIL_FIELDS[category]?.group;
  return g ? (d as unknown as Record<string, Record<string, unknown> | null | undefined>)[g] : null;
};

function initialDetails(d: DocumentDetail) {
  const out: Record<string, string> = {};
  const def = DETAIL_FIELDS[d.category as DocumentCategory];
  const group = groupOf(d, d.category as DocumentCategory);
  if (def && group) for (const f of def.fields) out[f.key] = f.kind === 'date' ? dateInput(group[f.key] as string) : String(group[f.key] ?? '');
  return out;
}

/**
 * Change what is known about a document: title, kind and its details, whose it is (patient and
 * visit), who may see it, notes and tags. The file itself never changes; upload a new one instead.
 * With `focus="patient"` it opens on filing an unfiled document.
 */
export default function EditDialog({ doc, onClose, onDone, focus }: { doc: DocumentDetail; onClose: () => void; onDone: (message: string) => void; focus?: 'patient' }) {
  const ids = useId();
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [category, setCategory] = useState<DocumentCategory>((doc.category as DocumentCategory) || 'other');
  const [details, setDetails] = useState(() => initialDetails(doc));
  const [expiry, setExpiry] = useState(dateInput(doc.expiryDate));
  const [patient, setPatient] = useState<PatientOption | null>(doc.patient ? { _id: doc.patient._id, firstName: doc.patient.firstName, lastName: doc.patient.lastName, patientCode: doc.patient.patientCode } : null);
  const [visitId, setVisitId] = useState(doc.visit?._id ?? '');
  const [staffOnly, setStaffOnly] = useState(Boolean(doc.isConfidential));
  const [notes, setNotes] = useState(doc.notes ?? '');
  const [tags, setTags] = useState((doc.tags ?? []).join(', '));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visits = useKeyedFetch<{ _id: string; visitCode: string; date: string }[]>(patient ? `/api/visits?patientId=${patient._id}&limit=20` : null);
  const patientVisits = visits.valueUrl?.includes(patient?._id ?? '#') ? (visits.value ?? []) : [];
  const titleProblem = title.trim() ? null : 'Give the document a title.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (titleProblem || busy) return;
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      title: title.trim(),
      category,
      notes: notes.trim(),
      tags: tags.split(',').map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 50),
      isConfidential: staffOnly,
    };
    if ((patient?._id ?? null) !== (doc.patient?._id ?? null)) body.patient = patient?._id ?? null;
    if ((patient ? visitId || null : null) !== (doc.visit?._id ?? null)) body.visit = patient ? visitId || null : null;
    if (HAS_EXPIRY.has(category)) body.expiryDate = expiry || null;
    const def = DETAIL_FIELDS[category];
    if (def) {
      const group: Record<string, string | null> = {};
      for (const f of def.fields) group[f.key] = details[f.key]?.trim() ? details[f.key].trim() : f.kind === 'date' ? null : '';
      // A certificate always keeps an issue date (the model requires one).
      if (category === 'medical_certificate' && !group.issueDate) group.issueDate = dateInput(doc.medicalCertificate?.issueDate) || new Date().toISOString().slice(0, 10);
      body[def.group] = group;
    }

    try {
      const res = await fetch(`/api/documents/${doc._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The changes could not be saved'));
        setBusy(false);
        return;
      }
      onDone(!doc.patient && patient ? `Filed to ${patient.firstName} ${patient.lastName}’s record.` : 'Changes saved.');
    } catch {
      setError('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl">
      <form onSubmit={submit} noValidate autoComplete="off">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight text-gray-900">{focus === 'patient' ? 'File to a patient' : 'Edit details'}</h2>
          <p className="mt-0.5 text-sm text-gray-500">The file itself stays as uploaded.</p>
        </div>
        {error && (
          <div role="alert" className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}
        <div className="space-y-5 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <PatientSearch
              optional
              autoFocus={focus === 'patient'}
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
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor={`${ids}-title`}>Title</Label>
              <input
                id={`${ids}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                autoFocus={focus !== 'patient'}
                aria-invalid={attempted && Boolean(titleProblem)}
                className={`${FIELD} ${attempted && titleProblem ? 'border-red-400' : ''}`}
              />
              {attempted && titleProblem && <FieldError id={`${ids}-title-err`}>{titleProblem}</FieldError>}
            </div>
            <div>
              <Label htmlFor={`${ids}-cat`}>Kind</Label>
              <select id={`${ids}-cat`} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} className={FIELD}>
                {DOCUMENT_CATEGORY_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {DETAIL_FIELDS[category] && <DetailFields category={category} values={details} onChange={(k, v) => setDetails((d) => ({ ...d, [k]: v }))} idPrefix={ids} />}
          {HAS_EXPIRY.has(category) && (
            <div className="max-w-xs">
              <Label htmlFor={`${ids}-exp`} optional>
                Valid until
              </Label>
              <input id={`${ids}-exp`} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`${FIELD} font-mono`} />
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            <span>
              <span className="font-medium text-gray-900">Staff only</span>
              <span className="block text-gray-500">{patient ? `Keep it out of ${patient.firstName}’s patient portal.` : 'Keep it out of the patient’s portal once filed.'}</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor={`${ids}-notes`} optional>
                Notes for staff
              </Label>
              <NoteArea id={`${ids}-notes`} rows={2} value={notes} onChange={setNotes} />
            </div>
            <div>
              <Label htmlFor={`${ids}-tags`} optional>
                Tags
              </Label>
              <input id={`${ids}-tags`} value={tags} onChange={(e) => setTags(e.target.value)} maxLength={500} placeholder="Separate with commas" className={FIELD} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:opacity-60 ${FOCUS_RING}`}>
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body
  );
}
