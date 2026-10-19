'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import type { ClinicalTemplateDTO } from '@/lib/clinical-templates';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;

function summaryOf(t: ClinicalTemplateDTO): string {
  if (t.kind === 'prescription' || (t.kind === 'visit' && !t.visit?.soapNotes && t.medications?.length)) {
    return (t.medications ?? []).map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' ')).join(' · ');
  }
  if (t.kind === 'phrase') return t.text ?? '';
  const dx = (t.visit?.diagnoses ?? []).map((d) => d.code || d.description).filter(Boolean).join(', ');
  const meds = t.medications?.length ? `${t.medications.length} medicine${t.medications.length === 1 ? '' : 's'}` : '';
  return [t.visit?.chiefComplaint, dx, meds].filter(Boolean).join(' · ');
}

/**
 * Searchable list of templates to apply: the user's own, those shared by the clinic,
 * and (for visit notes) the starter library.
 */
export function TemplatePickerDialog({
  open,
  onClose,
  title,
  templates,
  loading,
  error,
  onPick,
  emptyHint,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  templates: ClinicalTemplateDTO[];
  loading: boolean;
  error: string | null;
  onPick: (t: ClinicalTemplateDTO) => void;
  emptyHint: string;
}) {
  const headingId = useId();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: ClinicalTemplateDTO) =>
      !q || [t.name, t.specialty, summaryOf(t)].some((s) => s?.toLowerCase().includes(q));
    const list = templates.filter(match);
    return [
      { label: 'Yours', items: list.filter((t) => !t.starter && t.mine) },
      { label: 'Shared by the clinic', items: list.filter((t) => !t.starter && !t.mine) },
      { label: 'Starter library', items: list.filter((t) => t.starter) },
    ].filter((g) => g.items.length);
  }, [templates, query]);

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} labelledBy={headingId} className="max-w-xl">
      <div className="flex max-h-[80vh] flex-col">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 id={headingId} className="text-lg font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <div className="relative mt-3">
            <Svg d={ICON.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Inside the visit form: Enter must not submit the visit.
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="Search by name, specialty, diagnosis or medicine"
              aria-label="Search templates"
              autoFocus
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-5 py-6 text-sm text-gray-500">Loading…</p>
          ) : error ? (
            <p role="alert" className="px-5 py-6 text-sm text-red-700">{error}</p>
          ) : groups.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-600">{query ? 'Nothing matches that search.' : emptyHint}</p>
          ) : (
            groups.map((g) => (
              <div key={g.label}>
                <p className="sticky top-0 bg-gray-50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</p>
                <ul className="divide-y divide-gray-100">
                  {g.items.map((t) => (
                    <li key={t._id}>
                      <button
                        type="button"
                        onClick={() => onPick(t)}
                        className={`flex w-full flex-col items-start gap-0.5 px-5 py-3 text-left hover:bg-brand-teal-light/40 ${FOCUS_RING}`}
                      >
                        <span className="flex w-full items-baseline justify-between gap-3">
                          <span className="font-semibold text-gray-900">{t.name}</span>
                          {t.specialty && <span className="shrink-0 text-xs text-gray-500">{t.specialty}</span>}
                        </span>
                        <span className="line-clamp-2 text-sm text-gray-600">{summaryOf(t)}</span>
                        {!t.mine && t.ownerName && <span className="text-xs text-gray-500">by {t.ownerName}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <Link href="/templates" className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Manage templates
          </Link>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Name (and optionally share) what is on the form as a new template. */
export function SaveTemplateDialog({
  open,
  onClose,
  title,
  description,
  defaultName = '',
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  defaultName?: string;
  onSave: (input: { name: string; specialty?: string; shared: boolean }) => Promise<void>;
}) {
  const ids = useId();
  const [name, setName] = useState(defaultName);
  const [specialty, setSpecialty] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError('Name the template.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), specialty: specialty.trim() || undefined, shared });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} labelledBy={`${ids}-h`} className="max-w-md">
      {/* Not a <form>: the Modal renders inline, inside the visit form. Enter saves here
          instead of submitting the visit. */}
      <div
        className="flex flex-col gap-4 p-5"
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div>
          <h2 id={`${ids}-h`} className="text-lg font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <div>
          <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus className={FIELD} placeholder="e.g. URTI, adult" />
        </div>
        <div>
          <label htmlFor={`${ids}-spec`} className="mb-1.5 block text-sm font-medium text-gray-700">
            Specialty <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input id={`${ids}-spec`} value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={80} className={FIELD} placeholder="e.g. Pediatrics" />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
          <span>
            <span className="font-medium text-gray-900">Share with the clinic</span>
            <span className="block text-gray-500">Other staff can apply it. Only you can change it.</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
