'use client';

import { useId, useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import type { ClinicalTemplateDTO, TemplateMedication, TemplateVisitContent } from '@/lib/clinical-templates';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const ADD = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;
const REMOVE = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`;
const LABEL = 'mb-1.5 block text-sm font-medium text-gray-700';
const CELL_LABEL = 'mb-1 block text-xs text-gray-500 sm:sr-only';

const MAX_DX = 20;
const MAX_MEDS = 30;

let seq = 0;
const nextKey = () => `row-${++seq}`;

type DxRow = { key: string; code: string; description: string };
type MedRow = TemplateMedication & { key: string };

export interface TemplatePatch {
  name: string;
  specialty: string;
  shared?: boolean;
  visit?: TemplateVisitContent;
  medications?: TemplateMedication[];
}

const blank = (s: string) => s.trim() || undefined;

/**
 * Change a visit or prescription template in place: its name, specialty, sharing and
 * everything it fills in. Phrases are edited inline on the page instead.
 */
export function TemplateEditDialog({
  template: t,
  onClose,
  onSave,
}: {
  template: ClinicalTemplateDTO;
  onClose: () => void;
  /** Throws with the server's message when it can't be saved. */
  onSave: (patch: TemplatePatch) => Promise<void>;
}) {
  const ids = useId();
  const isVisit = t.kind === 'visit';
  const v = t.visit ?? {};

  const [name, setName] = useState(t.name);
  const [specialty, setSpecialty] = useState(t.specialty ?? '');
  const [shared, setShared] = useState(t.shared);
  const [cc, setCc] = useState(v.chiefComplaint ?? '');
  const [hpi, setHpi] = useState(v.historyOfPresentIllness ?? '');
  const [soap, setSoap] = useState({
    subjective: v.soapNotes?.subjective ?? '',
    objective: v.soapNotes?.objective ?? '',
    assessment: v.soapNotes?.assessment ?? '',
    plan: v.soapNotes?.plan ?? '',
  });
  const [followUp, setFollowUp] = useState(v.followUpInstructions ?? '');
  const [dx, setDx] = useState<DxRow[]>(() =>
    // Main diagnosis first, so "the first one is the main one" stays true after saving.
    [...(v.diagnoses ?? [])]
      .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
      .map((d) => ({ key: nextKey(), code: d.code ?? '', description: d.description ?? '' }))
  );
  const [meds, setMeds] = useState<MedRow[]>(() => {
    const rows = (t.medications ?? []).map((m) => ({ ...m, key: nextKey() }));
    return rows.length || isVisit ? rows : [{ key: nextKey(), name: '' }];
  });

  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const examCount = Object.values(v.physicalExam ?? {}).filter((s) => s?.trim()).length;
  const namedMeds = meds.filter((m) => m.name.trim());
  const errors = {
    name: name.trim() ? null : 'Name the template.',
    meds: meds.some((m) => !m.name.trim() && [m.dosage, m.frequency, m.duration, m.instructions].some((s) => s?.trim()))
      ? 'Name each medicine, or remove the row.'
      : !isVisit && namedMeds.length === 0
        ? 'Add at least one medicine.'
        : null,
  };
  const problems = [errors.name, errors.meds].filter(Boolean).length;

  const setMed = (key: string, patch: Partial<TemplateMedication>) => setMeds((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setDiagnosis = (key: string, patch: Partial<DxRow>) => setDx((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (problems) {
      document.getElementById(errors.name ? `${ids}-name` : `${ids}-meds`)?.focus();
      return;
    }
    // Fields not shown here (generic name, form, strength, route, quantity) are kept as they were.
    const medications: TemplateMedication[] = namedMeds.map((row) => ({
      name: row.name.trim(),
      genericName: row.genericName,
      form: row.form,
      strength: row.strength,
      route: row.route,
      quantity: row.quantity,
      dosage: blank(row.dosage ?? ''),
      frequency: blank(row.frequency ?? ''),
      duration: blank(row.duration ?? ''),
      instructions: blank(row.instructions ?? ''),
    }));
    const patch: TemplatePatch = { name: name.trim(), specialty: specialty.trim(), medications };
    if (t.mine) patch.shared = shared;
    if (isVisit) {
      const diagnoses = dx
        .filter((d) => d.code.trim() || d.description.trim())
        .map((d, i) => ({ code: d.code.trim().toUpperCase() || undefined, description: blank(d.description), primary: i === 0 }));
      patch.visit = {
        chiefComplaint: blank(cc),
        historyOfPresentIllness: blank(hpi),
        soapNotes: { subjective: blank(soap.subjective), objective: blank(soap.objective), assessment: blank(soap.assessment), plan: blank(soap.plan) },
        // Not editable here; sent back so saving keeps it.
        physicalExam: v.physicalExam,
        diagnoses,
        followUpInstructions: blank(followUp),
      };
    }
    setBusy(true);
    setServerError(null);
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  };

  const textarea = (id: string, label: string, value: string, onChange: (s: string) => void, rows = 3, max = 4000) => (
    <div>
      <label htmlFor={`${ids}-${id}`} className={LABEL}>
        {label}
      </label>
      <textarea id={`${ids}-${id}`} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={max} className={`${FIELD} resize-y`} />
    </div>
  );

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} labelledBy={`${ids}-h`} className="max-w-2xl" closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate className="flex max-h-[90vh] flex-col">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 id={`${ids}-h`} className="text-lg font-bold tracking-tight text-gray-900">
            {isVisit ? 'Edit visit template' : 'Edit saved prescription'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t.mine
              ? 'Notes already written from it stay as they are.'
              : `Belongs to ${t.ownerName ?? 'a colleague'}. Your changes reach everyone who uses it and are recorded in the audit log.`}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-name`} className={LABEL}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                aria-invalid={tried && !!errors.name}
                aria-describedby={tried && errors.name ? `${ids}-name-err` : undefined}
                className={`${FIELD} ${tried && errors.name ? 'border-red-400' : ''}`}
              />
              {tried && errors.name && <FieldError id={`${ids}-name-err`}>{errors.name}</FieldError>}
            </div>
            <div>
              <label htmlFor={`${ids}-spec`} className={LABEL}>
                Specialty <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input id={`${ids}-spec`} value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={80} className={FIELD} placeholder="e.g. Pediatrics" />
            </div>
          </div>

          {isVisit && (
            <fieldset className="space-y-4">
              <legend className="mb-3 text-base font-bold tracking-tight text-gray-900">Note</legend>
              <div>
                <label htmlFor={`${ids}-cc`} className={LABEL}>
                  Chief complaint
                </label>
                <input id={`${ids}-cc`} value={cc} onChange={(e) => setCc(e.target.value)} maxLength={500} className={FIELD} />
              </div>
              {textarea('hpi', 'History of present illness', hpi, setHpi, 2)}
              {textarea('s', 'Subjective', soap.subjective, (s) => setSoap((x) => ({ ...x, subjective: s })))}
              {textarea('o', 'Objective', soap.objective, (s) => setSoap((x) => ({ ...x, objective: s })))}
              {textarea('a', 'Assessment', soap.assessment, (s) => setSoap((x) => ({ ...x, assessment: s })), 2)}
              {textarea('p', 'Plan', soap.plan, (s) => setSoap((x) => ({ ...x, plan: s })))}
              {examCount > 0 && (
                <p className="text-sm text-gray-500">
                  Also keeps its physical exam findings ({examCount}). Change those by saving a new template from a visit note.
                </p>
              )}
            </fieldset>
          )}

          {isVisit && (
            <fieldset>
              <legend className="mb-1 text-base font-bold tracking-tight text-gray-900">Diagnoses</legend>
              <p className="mb-3 text-sm text-gray-500">The first one is the main diagnosis.</p>
              {dx.length > 0 && (
                <div className="hidden gap-2 pb-1 text-xs text-gray-500 sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_2.25rem]" aria-hidden="true">
                  <span>ICD-10</span>
                  <span>Description</span>
                </div>
              )}
              <ul className="space-y-3 sm:space-y-2">
                {dx.map((d, i) => (
                  <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-end gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_2.25rem]">
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={`${d.key}-code`} className={CELL_LABEL}>
                        ICD-10 code, diagnosis {i + 1}
                      </label>
                      <input id={`${d.key}-code`} value={d.code} onChange={(e) => setDiagnosis(d.key, { code: e.target.value })} maxLength={20} className={`${FIELD} font-mono uppercase`} />
                    </div>
                    <div>
                      <label htmlFor={`${d.key}-desc`} className={CELL_LABEL}>
                        Description, diagnosis {i + 1}
                      </label>
                      <input id={`${d.key}-desc`} value={d.description} onChange={(e) => setDiagnosis(d.key, { description: e.target.value })} maxLength={300} className={FIELD} />
                    </div>
                    <button type="button" onClick={() => setDx((rows) => rows.filter((r) => r.key !== d.key))} className={REMOVE} aria-label={`Remove diagnosis ${i + 1}`}>
                      <Svg d={ICON.x} />
                    </button>
                  </li>
                ))}
              </ul>
              {dx.length === 0 && <p className="text-sm text-gray-500">None on this template.</p>}
              {dx.length < MAX_DX && (
                <button type="button" onClick={() => setDx((rows) => [...rows, { key: nextKey(), code: '', description: '' }])} className={`${ADD} mt-3`}>
                  <Svg d="M12 5v14M5 12h14" />
                  Add diagnosis
                </button>
              )}
            </fieldset>
          )}

          <fieldset>
            <legend id={`${ids}-meds`} tabIndex={-1} className="mb-1 text-base font-bold tracking-tight text-gray-900 focus:outline-none">
              Medicines
            </legend>
            <p className="mb-3 text-sm text-gray-500">Added to the note unless it already lists a medicine with the same name.</p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {meds.map((m, i) => {
                const invalid = tried && !m.name.trim() && (!!errors.meds);
                return (
                  <li key={m.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_2.25rem] sm:items-end">
                    <MedCell id={`${m.key}-name`} label="Medicine" hint={`medicine ${i + 1}`}>
                      <input
                        id={`${m.key}-name`}
                        value={m.name}
                        onChange={(e) => setMed(m.key, { name: e.target.value })}
                        maxLength={200}
                        aria-invalid={invalid}
                        className={`${FIELD} ${invalid ? 'border-red-400' : ''}`}
                        placeholder="Name"
                      />
                    </MedCell>
                    <MedCell id={`${m.key}-dose`} label="Dose" hint={`medicine ${i + 1}`}>
                      <input id={`${m.key}-dose`} value={m.dosage ?? ''} onChange={(e) => setMed(m.key, { dosage: e.target.value })} maxLength={100} className={FIELD} placeholder="1 tablet" />
                    </MedCell>
                    <MedCell id={`${m.key}-freq`} label="How often" hint={`medicine ${i + 1}`}>
                      <input id={`${m.key}-freq`} value={m.frequency ?? ''} onChange={(e) => setMed(m.key, { frequency: e.target.value })} maxLength={100} className={FIELD} placeholder="3 times a day" />
                    </MedCell>
                    <MedCell id={`${m.key}-dur`} label="How long" hint={`medicine ${i + 1}`}>
                      <input id={`${m.key}-dur`} value={m.duration ?? ''} onChange={(e) => setMed(m.key, { duration: e.target.value })} maxLength={100} className={FIELD} placeholder="7 days" />
                    </MedCell>
                    <button
                      type="button"
                      onClick={() => setMeds((rows) => rows.filter((r) => r.key !== m.key))}
                      className={`${REMOVE} justify-self-end`}
                      aria-label={`Remove ${m.name.trim() || `medicine ${i + 1}`}`}
                    >
                      <Svg d={ICON.x} />
                    </button>
                    <div className="sm:col-span-4">
                      <label htmlFor={`${m.key}-ins`} className="sr-only">
                        Instructions, medicine {i + 1}
                      </label>
                      <input id={`${m.key}-ins`} value={m.instructions ?? ''} onChange={(e) => setMed(m.key, { instructions: e.target.value })} maxLength={500} className={FIELD} placeholder="Instructions (optional), e.g. after meals" />
                    </div>
                    {(m.strength || m.form || m.quantity) && (
                      <p className="text-xs text-gray-500 sm:col-span-4">
                        Keeps {[m.strength, m.form, m.quantity ? `quantity ${m.quantity}` : ''].filter(Boolean).join(', ')}.
                      </p>
                    )}
                  </li>
                );
              })}
              {meds.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">None on this template.</li>}
            </ul>
            {tried && errors.meds && <FieldError id={`${ids}-meds-err`}>{errors.meds}</FieldError>}
            {meds.length < MAX_MEDS && (
              <button type="button" onClick={() => setMeds((rows) => [...rows, { key: nextKey(), name: '' }])} className={`${ADD} mt-3`}>
                <Svg d="M12 5v14M5 12h14" />
                Add medicine
              </button>
            )}
          </fieldset>

          {isVisit && textarea('fu', 'Follow-up advice', followUp, setFollowUp, 2, 1000)}

          {t.mine && (
            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
              <span>
                <span className="font-medium text-gray-900">Share with the clinic</span>
                <span className="block text-gray-500">Other staff can apply it. Only you can change it.</span>
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p role={serverError ? 'alert' : undefined} className={`text-sm ${serverError || (tried && problems) ? 'text-red-700' : 'text-gray-500'}`}>
            {serverError ?? (tried && problems ? `${problems} ${problems === 1 ? 'thing needs' : 'things need'} fixing.` : '')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function MedCell({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        {label}
        <span className="sr-only">, {hint}</span>
      </label>
      {children}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-sm text-red-700">
      <Svg d={ICON.alert} className="h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
