'use client';

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { Modal } from './ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { VISIT_TYPES } from './visits/shared';
import PatientSummary, { allergyList, usePatientSummary } from './visits/form/PatientSummary';
import {
  ADD_BUTTON,
  FieldError,
  Icd10Field,
  Label,
  MedicineNameField,
  NoteArea,
  REMOVE_BUTTON,
  Section,
  ValueField,
  VitalsFields,
  WithMedicineValues,
  vitalsProblems,
  vitalsSentence,
  vitalsToRecord,
  vitalsToText,
  type VitalsText,
} from './visits/form/parts';
import { PhrasesProvider } from './templates/phrases';
import { useTemplates } from './templates/useTemplates';
import { SaveTemplateDialog, TemplatePickerDialog } from './templates/TemplateDialogs';
import { fillBlank, mergeDiagnoses, mergeMedications, type ClinicalTemplateDTO, type TemplateMedication, type TemplateVisitContent } from '@/lib/clinical-templates';
import ScribePanel, { type ScribeSelection } from './visits/ScribePanel';
import { QuickAddMedicineDialog } from './visits/form/QuickAddMedicineDialog';

const SignaturePad = dynamic(() => import('./SignaturePad'), { ssr: false });

type VisitType = 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult' | 'vaccination';

/** The shape the visit API takes (and the detail page hands back in for editing). */
export interface VisitFormData {
  _id?: string;
  status?: 'draft' | 'open' | 'closed' | 'cancelled';
  patient: string;
  visitType: VisitType;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  admittingImpression?: string;
  vitals?: Partial<Record<'bp' | 'hr' | 'rr' | 'tempC' | 'spo2' | 'heightCm' | 'weightKg' | 'bmi', string | number | null>>;
  physicalExam?: Record<string, string | undefined>;
  diagnoses: Array<{ code?: string; description?: string; primary?: boolean }>;
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  treatmentPlan?: {
    medications?: Array<{ name: string; dosage: string; frequency: string; duration: string; quantity?: number; instructions?: string }>;
    procedures?: Array<{ name: string; description?: string; scheduledDate?: string }>;
    lifestyle?: Array<{ category: string; instructions: string }>;
    followUp?: { date?: string | null; instructions?: string; reminderSent?: boolean };
  };
  /** yyyy-MM-dd, or null to clear it. */
  followUpDate?: string | null;
  notes?: string;
  digitalSignature?: { providerName: string; signatureData: string };
}

interface VisitFormProps {
  initialData?: Partial<VisitFormData>;
  /** The preselected patient (when the patient is locked or already chosen). */
  patients: PatientOption[];
  /** Return (or resolve to) false when the save failed so the local copy is kept. */
  onSubmit: (data: VisitFormData) => void | boolean | Promise<void | boolean>;
  onCancel?: () => void;
  onDraftSaved?: (draftId: string) => void;
  providerName: string;
  lockPatientSelection?: boolean;
  /** Where pre-filled vital signs came from, e.g. "Taken at triage, queue A-12". */
  vitalsSource?: string;
}

// ---------------------------------------------------------------------------
// Note state (strings while editing; converted once on save)
// ---------------------------------------------------------------------------

interface Dx {
  _key: string;
  code: string;
  description: string;
  primary: boolean;
}
interface Med {
  _key: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}
interface Note {
  patient: string;
  visitType: VisitType;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  admittingImpression: string;
  vitals: VitalsText;
  exam: Record<ExamKey, string>;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  diagnoses: Dx[];
  medications: Med[];
  followUpDate: string;
  followUpInstructions: string;
  notes: string;
}

type ExamKey = 'general' | 'heent' | 'chest' | 'lungs' | 'cardiovascular' | 'abdomen' | 'extremities' | 'skin' | 'lymphNotes' | 'breast' | 'rectum' | 'genitalia' | 'musculoskeletal' | 'neurological' | 'other';

const EXAM: { key: ExamKey; label: string; hint: string }[] = [
  { key: 'general', label: 'General', hint: 'Appearance, alertness, distress' },
  { key: 'heent', label: 'HEENT', hint: 'Head, eyes, ears, nose, throat' },
  { key: 'chest', label: 'Chest', hint: 'Chest wall' },
  { key: 'lungs', label: 'Lungs', hint: 'Breath sounds, wheeze, crackles' },
  { key: 'cardiovascular', label: 'Heart', hint: 'Heart sounds, pulses' },
  { key: 'abdomen', label: 'Abdomen', hint: 'Tenderness, masses, bowel sounds' },
  { key: 'extremities', label: 'Extremities', hint: 'Edema, pulses, range of motion' },
  { key: 'skin', label: 'Skin', hint: 'Rashes, lesions, turgor' },
  { key: 'lymphNotes', label: 'Lymph nodes', hint: 'Palpable nodes' },
  { key: 'breast', label: 'Breast', hint: '' },
  { key: 'rectum', label: 'Rectum', hint: '' },
  { key: 'genitalia', label: 'Genitalia', hint: '' },
  { key: 'musculoskeletal', label: 'Musculoskeletal', hint: 'Joints, gait, strength' },
  { key: 'neurological', label: 'Neurological', hint: 'Mental status, cranial nerves, reflexes' },
  { key: 'other', label: 'Other', hint: '' },
];

const LOCAL_DRAFT_KEY = 'visit_form_draft';

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;
const emptyDx = (primary: boolean): Dx => ({ _key: newKey(), code: '', description: '', primary });
const emptyMed = (): Med => ({ _key: newKey(), name: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '' });

function noteFrom(d?: Partial<VisitFormData> | null): Note {
  const pe = d?.physicalExam ?? {};
  const exam = Object.fromEntries(EXAM.map((e) => [e.key, ''])) as Record<ExamKey, string>;
  for (const e of EXAM) exam[e.key] = pe[e.key] ?? '';
  exam.heent = pe.headEent || pe.heent || '';
  exam.neurological = pe.neurological || pe.neuro || '';
  const followUp = d?.followUpDate || d?.treatmentPlan?.followUp?.date || '';
  return {
    patient: d?.patient ?? '',
    visitType: (d?.visitType as VisitType) ?? 'consultation',
    chiefComplaint: d?.chiefComplaint ?? '',
    historyOfPresentIllness: d?.historyOfPresentIllness ?? '',
    admittingImpression: d?.admittingImpression ?? '',
    vitals: vitalsToText(d?.vitals),
    exam,
    soap: {
      subjective: d?.soapNotes?.subjective ?? '',
      objective: d?.soapNotes?.objective ?? '',
      assessment: d?.soapNotes?.assessment ?? '',
      plan: d?.soapNotes?.plan ?? '',
    },
    diagnoses: (d?.diagnoses ?? []).map((x) => ({ _key: newKey(), code: x.code ?? '', description: x.description ?? '', primary: Boolean(x.primary) })),
    medications: (d?.treatmentPlan?.medications ?? []).map((m) => ({
      _key: newKey(),
      name: m.name ?? '',
      dosage: m.dosage ?? '',
      frequency: m.frequency ?? '',
      duration: m.duration ?? '',
      quantity: m.quantity != null ? String(m.quantity) : '',
      instructions: m.instructions ?? '',
    })),
    followUpDate: followUp ? String(followUp).slice(0, 10) : '',
    followUpInstructions: d?.treatmentPlan?.followUp?.instructions ?? '',
    notes: d?.notes ?? '',
  };
}

/** Everything but the React row keys, so "has anything changed" ignores them. */
function snapshot(n: Note) {
  return JSON.stringify(n, (k, v) => (k === '_key' ? undefined : v));
}

const medIsBlank = (m: Med) => !m.name.trim() && !m.dosage.trim() && !m.frequency.trim() && !m.duration.trim() && !m.instructions.trim();

const medFromTemplate = (m: TemplateMedication): Med => ({
  _key: newKey(),
  name: m.name,
  dosage: m.dosage ?? '',
  frequency: m.frequency ?? '',
  duration: m.duration ?? '',
  quantity: m.quantity != null ? String(m.quantity) : '',
  instructions: m.instructions ?? '',
});

const medToTemplate = (m: Med): TemplateMedication => ({
  name: m.name.trim(),
  ...(m.dosage.trim() ? { dosage: m.dosage.trim() } : {}),
  ...(m.frequency.trim() ? { frequency: m.frequency.trim() } : {}),
  ...(m.duration.trim() ? { duration: m.duration.trim() } : {}),
  ...(m.quantity.trim() && Number(m.quantity) >= 0 ? { quantity: Number(m.quantity) } : {}),
  ...(m.instructions.trim() ? { instructions: m.instructions.trim() } : {}),
});

/**
 * Apply a visit template or saved prescription to the note: blank fields are filled, fields
 * the doctor already wrote are left alone, diagnoses and medicines are added (no duplicates).
 */
function applyTemplate(note: Note, t: Pick<ClinicalTemplateDTO, 'visit' | 'medications'>): { note: Note; skipped: number } {
  let skipped = 0;
  const fill = (current: string, incoming?: string) => {
    const r = fillBlank(current, incoming);
    if (r.skipped) skipped++;
    return r.value;
  };
  const v = t.visit ?? {};
  const exam = { ...note.exam };
  for (const [key, text] of Object.entries(v.physicalExam ?? {})) {
    if (key in exam) exam[key as ExamKey] = fill(exam[key as ExamKey], text);
  }
  return {
    skipped,
    note: {
      ...note,
      chiefComplaint: fill(note.chiefComplaint, v.chiefComplaint),
      historyOfPresentIllness: fill(note.historyOfPresentIllness, v.historyOfPresentIllness),
      soap: {
        subjective: fill(note.soap.subjective, v.soapNotes?.subjective),
        objective: fill(note.soap.objective, v.soapNotes?.objective),
        assessment: fill(note.soap.assessment, v.soapNotes?.assessment),
        plan: fill(note.soap.plan, v.soapNotes?.plan),
      },
      exam,
      diagnoses: mergeDiagnoses(note.diagnoses, v.diagnoses, (d) => ({ _key: newKey(), ...d })),
      medications: mergeMedications(note.medications, t.medications, medFromTemplate, medIsBlank),
      followUpInstructions: fill(note.followUpInstructions, v.followUpInstructions),
    },
  };
}

function readLocalDraft(): { timestamp: string; note: Note } | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.note) return { timestamp: parsed.timestamp ?? '', note: { ...noteFrom(null), ...parsed.note } };
    // Older copies kept the API shape plus a separate vitals object.
    if (parsed?.data) return { timestamp: parsed.timestamp ?? '', note: noteFrom({ ...parsed.data, vitals: parsed.vitals ?? parsed.data.vitals }) };
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export default function VisitForm({ initialData, patients, onSubmit, onCancel, onDraftSaved, providerName, lockPatientSelection = false, vitalsSource }: VisitFormProps) {
  const ids = useId();
  const editingExisting = Boolean(initialData?._id);
  const canSaveDraft = !editingExisting || initialData?.status === 'draft';

  const [note, setNote] = useState<Note>(() => noteFrom(initialData));
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(noteFrom(initialData)));
  const [signature, setSignature] = useState(initialData?.digitalSignature ?? null);
  const [signedNow, setSignedNow] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [picked, setPicked] = useState<PatientOption | null>(() => patients.find((p) => p._id === initialData?.patient) ?? null);
  const [draftId, setDraftId] = useState<string | undefined>(initialData?._id && initialData.status === 'draft' ? initialData._id : undefined);
  const [draftState, setDraftState] = useState<{ kind: 'saving' | 'saved' | 'error'; message?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Only new visits offer the copy kept on this device, and only for the patient being seen.
  const [localDraft, setLocalDraft] = useState(() => {
    if (editingExisting) return null;
    const d = readLocalDraft();
    if (!d) return null;
    if (lockPatientSelection && d.note.patient && d.note.patient !== initialData?.patient) return null;
    return d;
  });

  const patient = picked && picked._id === note.patient ? picked : null;
  const summary = usePatientSummary(note.patient || null, initialData?._id);
  const allergies = allergyList(summary.data?.patient.allergies);

  const dirty = snapshot(note) !== savedSnapshot || signedNow;
  const set = useCallback(<K extends keyof Note>(key: K, value: Note[K]) => setNote((n) => ({ ...n, [key]: value })), []);

  // --- Templates, saved prescriptions and phrases ---------------------------------

  const tpl = useTemplates();
  const visitTemplates = useMemo(() => tpl.templates.filter((t) => t.kind === 'visit'), [tpl.templates]);
  const rxTemplates = useMemo(() => tpl.templates.filter((t) => t.kind === 'prescription'), [tpl.templates]);
  const [picker, setPicker] = useState<'visit' | 'prescription' | null>(null);
  const [saveAs, setSaveAs] = useState<'visit' | 'prescription' | null>(null);
  // The medicine row whose typed name is being added to the clinic's medicines list.
  const [addingMed, setAddingMed] = useState<{ key: string; name: string } | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const pickTemplate = (t: ClinicalTemplateDTO) => {
    const { note: next, skipped } = applyTemplate(note, t);
    setNote(next);
    setPicker(null);
    tpl.markUsed(t._id);
    setTemplateNotice(
      `Applied “${t.name}”.${skipped ? ` ${skipped === 1 ? 'One field' : `${skipped} fields`} you had already written ${skipped === 1 ? 'was' : 'were'} left as ${skipped === 1 ? 'it was' : 'they were'}.` : ''} Review before saving.`
    );
  };

  // --- AI scribe --------------------------------------------------------------------

  const [scribe, setScribe] = useState<{ available: boolean; planAllows: boolean; configured: boolean } | null>(null);
  const [scribeOpen, setScribeOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/ai-scribe')
      .then((r) => r.json())
      .then((json) => alive && json?.success && setScribe(json.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const applyScribe = ({ draft, include, replace }: ScribeSelection) => {
    const visit: TemplateVisitContent = {
      chiefComplaint: include.chiefComplaint ? draft.chiefComplaint : undefined,
      historyOfPresentIllness: include.historyOfPresentIllness ? draft.historyOfPresentIllness : undefined,
      soapNotes: {
        subjective: include.soap.subjective ? draft.soap.subjective : undefined,
        objective: include.soap.objective ? draft.soap.objective : undefined,
        assessment: include.soap.assessment ? draft.soap.assessment : undefined,
        plan: include.soap.plan ? draft.soap.plan : undefined,
      },
      physicalExam: include.exam ? Object.fromEntries(draft.physicalExam.map((p) => [p.system, p.finding])) : undefined,
      diagnoses: draft.diagnoses.filter((_, i) => include.diagnoses[i]),
      followUpInstructions: include.followUp ? draft.followUp.instructions : undefined,
    };
    const medications: TemplateMedication[] = draft.medications
      .filter((_, i) => include.medications[i])
      .map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, quantity: m.quantity ?? undefined, instructions: m.instructions }));

    // "Replace" clears the fields the draft has content for; otherwise only blanks are filled.
    let base = note;
    if (replace) {
      const clear = (cur: string, incoming?: string) => (incoming?.trim() ? '' : cur);
      const exam = { ...note.exam };
      for (const key of Object.keys(visit.physicalExam ?? {})) if (key in exam) exam[key as ExamKey] = '';
      base = {
        ...note,
        chiefComplaint: clear(note.chiefComplaint, visit.chiefComplaint),
        historyOfPresentIllness: clear(note.historyOfPresentIllness, visit.historyOfPresentIllness),
        soap: {
          subjective: clear(note.soap.subjective, visit.soapNotes?.subjective),
          objective: clear(note.soap.objective, visit.soapNotes?.objective),
          assessment: clear(note.soap.assessment, visit.soapNotes?.assessment),
          plan: clear(note.soap.plan, visit.soapNotes?.plan),
        },
        exam,
        diagnoses: visit.diagnoses?.length ? [] : note.diagnoses,
        medications: medications.length ? [] : note.medications,
        followUpInstructions: clear(note.followUpInstructions, visit.followUpInstructions),
      };
    }
    const { note: next, skipped } = applyTemplate(base, { visit, medications });
    const days = include.followUp ? draft.followUp.inDays : null;
    if (days && days > 0 && (replace || !next.followUpDate)) {
      const d = new Date();
      d.setDate(d.getDate() + Math.round(days));
      next.followUpDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    setNote(next);
    setTemplateNotice(
      `AI draft applied.${skipped ? ` ${skipped === 1 ? 'One field' : `${skipped} fields`} you had already written ${skipped === 1 ? 'was' : 'were'} kept.` : ''} Check every field before saving — you are signing this note.`
    );
  };

  const namedMeds = note.medications.filter((m) => m.name.trim());

  const saveTemplate = async (input: { name: string; specialty?: string; shared: boolean }) => {
    if (saveAs === 'prescription') {
      await tpl.create({ kind: 'prescription', ...input, medications: namedMeds.map(medToTemplate) });
      setTemplateNotice(`Saved “${input.name}” to your prescriptions.`);
      return;
    }
    const physicalExam = Object.fromEntries(EXAM.map((x) => [x.key, note.exam[x.key].trim()]).filter(([, v]) => v));
    await tpl.create({
      kind: 'visit',
      ...input,
      visit: {
        chiefComplaint: note.chiefComplaint.trim() || undefined,
        historyOfPresentIllness: note.historyOfPresentIllness.trim() || undefined,
        soapNotes: { ...note.soap },
        physicalExam,
        diagnoses: note.diagnoses
          .filter((d) => d.code.trim() || d.description.trim())
          .map((d) => ({ code: d.code.trim().toUpperCase(), description: d.description.trim(), primary: d.primary })),
        followUpInstructions: note.followUpInstructions.trim() || undefined,
      },
      medications: namedMeds.map(medToTemplate),
    });
    setTemplateNotice(`Saved “${input.name}” as a template.`);
  };

  // --- Problems (shown once the user tries to save) ---------------------------

  const vProblems = vitalsProblems(note.vitals);
  const medProblems = useMemo(() => {
    const out: Record<string, string> = {};
    note.medications.forEach((m) => {
      if (!medIsBlank(m) && !m.name.trim()) out[m._key] = 'Name the medicine, or remove this row.';
      else if (m.quantity.trim() && !(Number(m.quantity) >= 0)) out[m._key] = 'Quantity should be a number.';
    });
    return out;
  }, [note.medications]);
  const patientProblem = !note.patient || (!lockPatientSelection && !patient && !editingExisting) ? 'Choose the patient this visit is for.' : null;
  const problemCount = (patientProblem ? 1 : 0) + Object.keys(vProblems).length + Object.keys(medProblems).length;

  // --- Unsaved changes --------------------------------------------------------

  useUnsavedChanges(dirty, 'This note has changes that are not saved. Leave anyway?');

  // Keep a copy on this device while a new note is being written (never for an existing one).
  useEffect(() => {
    if (!dirty || editingExisting) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ timestamp: new Date().toISOString(), note }));
      } catch {
        // storage full or unavailable
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, editingExisting, note]);

  useEffect(() => {
    if (draftState?.kind !== 'saved') return;
    const t = setTimeout(() => setDraftState(null), 4000);
    return () => clearTimeout(t);
  }, [draftState]);

  // --- Payload ------------------------------------------------------------------

  const payload = (): VisitFormData => {
    const pe: Record<string, string> = {};
    for (const e of EXAM) pe[e.key] = note.exam[e.key];
    pe.headEent = note.exam.heent;
    pe.neuro = note.exam.neurological;
    const diagnoses = note.diagnoses
      .filter((d) => d.code.trim() || d.description.trim())
      .map((d) => ({ code: d.code.trim().toUpperCase(), description: d.description.trim(), primary: d.primary }));
    if (diagnoses.length && !diagnoses.some((d) => d.primary)) diagnoses[0].primary = true;
    // A draft saved during this session is the record to finish, not a reason for a second visit.
    const recordId = draftId ?? initialData?._id;
    const status = draftId ? 'draft' : initialData?.status;
    return {
      ...(recordId ? { _id: recordId } : {}),
      ...(status ? { status } : {}),
      patient: note.patient,
      visitType: note.visitType,
      chiefComplaint: note.chiefComplaint,
      historyOfPresentIllness: note.historyOfPresentIllness,
      admittingImpression: note.admittingImpression,
      vitals: vitalsToRecord(note.vitals) ?? {},
      physicalExam: pe,
      diagnoses,
      soapNotes: { ...note.soap },
      treatmentPlan: {
        // Procedures and advice are not edited here; carry them through untouched.
        ...(initialData?.treatmentPlan?.procedures ? { procedures: initialData.treatmentPlan.procedures } : {}),
        ...(initialData?.treatmentPlan?.lifestyle ? { lifestyle: initialData.treatmentPlan.lifestyle } : {}),
        medications: note.medications
          .filter((m) => !medIsBlank(m))
          .map((m) => ({
            name: m.name.trim(),
            dosage: m.dosage.trim(),
            frequency: m.frequency.trim(),
            duration: m.duration.trim(),
            ...(m.quantity.trim() ? { quantity: Number(m.quantity) } : {}),
            instructions: m.instructions.trim(),
          })),
        followUp: { ...initialData?.treatmentPlan?.followUp, date: note.followUpDate || null, instructions: note.followUpInstructions },
      },
      followUpDate: note.followUpDate || null,
      notes: note.notes,
      // Only a signature drawn now is sent; resending an old one would re-sign it as the editor.
      ...(signature && (signedNow || !editingExisting) ? { digitalSignature: signature } : {}),
    };
  };

  const focusFirstProblem = () => {
    requestAnimationFrame(() => {
      const marked = document.querySelector<HTMLElement>('[data-visit-form] [aria-invalid="true"], [data-visit-form] [data-invalid="true"]');
      const el = marked?.matches('input,select,textarea') ? marked : marked?.querySelector<HTMLElement>('input,select,textarea');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setAttempted(true);
    if (problemCount > 0) {
      focusFirstProblem();
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit(payload());
      if (ok !== false) {
        setSavedSnapshot(snapshot(note));
        setSignedNow(false);
        try {
          localStorage.removeItem(LOCAL_DRAFT_KEY);
        } catch {
          // storage unavailable
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async () => {
    setAttempted(true);
    if (patientProblem) {
      setDraftState({ kind: 'error', message: 'Choose the patient before saving a draft.' });
      focusFirstProblem();
      return;
    }
    setDraftState({ kind: 'saving' });
    try {
      const body = JSON.stringify({ ...payload(), status: 'draft' });
      const res = draftId
        ? await fetch(`/api/visits/${draftId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      const savedId: string = json.data._id;
      setDraftId(savedId);
      setSavedSnapshot(snapshot(note));
      setSignedNow(false);
      setDraftState({ kind: 'saved' });
      onDraftSaved?.(savedId);
      try {
        localStorage.removeItem(LOCAL_DRAFT_KEY);
      } catch {
        // storage unavailable
      }
    } catch (err) {
      setDraftState({ kind: 'error', message: `The draft wasn’t saved (${err instanceof Error ? err.message : 'request failed'}). Your note is still here.` });
    }
  };

  // --- Rows ---------------------------------------------------------------------

  const setDx = (key: string, patch: Partial<Dx>) =>
    setNote((n) => ({ ...n, diagnoses: n.diagnoses.map((d) => (d._key === key ? { ...d, ...patch } : patch.primary ? { ...d, primary: false } : d)) }));
  const removeDx = (key: string) =>
    setNote((n) => {
      const rest = n.diagnoses.filter((d) => d._key !== key);
      if (rest.length && !rest.some((d) => d.primary)) rest[0] = { ...rest[0], primary: true };
      return { ...n, diagnoses: rest };
    });
  const setMed = (key: string, patch: Partial<Med>) => setNote((n) => ({ ...n, medications: n.medications.map((m) => (m._key === key ? { ...m, ...patch } : m)) }));

  const sentence = vitalsSentence(note.vitals);
  const medsToPrescribe = note.medications.filter((m) => m.name.trim()).length;
  const primaryLabel = editingExisting && initialData?.status !== 'draft' ? 'Save changes' : 'Save visit';
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <PhrasesProvider templates={tpl.templates} markUsed={tpl.markUsed}>
    <form onSubmit={handleSubmit} noValidate data-visit-form className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600" aria-live="polite">
          {templateNotice ?? (
            <>
              Start from a template, or type <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-xs">.shortcut</kbd> and a space in any note to insert a saved phrase.
            </>
          )}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {scribe?.configured && (
            <button
              type="button"
              onClick={() => setScribeOpen(true)}
              disabled={!scribe.planAllows}
              title={scribe.planAllows ? 'Draft the note from a dictated or pasted consult' : 'Part of the Professional and Enterprise plans'}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Svg d="M12 18.5a6.5 6.5 0 006.5-6.5M12 18.5A6.5 6.5 0 015.5 12M12 18.5V22m0-7.5a3 3 0 01-3-3V5a3 3 0 116 0v6.5a3 3 0 01-3 3z" />
              AI scribe
            </button>
          )}
          <button type="button" onClick={() => setPicker('visit')} className={ADD_BUTTON}>
            <Svg d="M4 6h16M4 12h16M4 18h10" />
            Apply template
          </button>
          <button type="button" onClick={() => setSaveAs('visit')} className={ADD_BUTTON}>
            <Svg d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            Save as template
          </button>
        </div>
      </div>

      {localDraft && (
        <div role="status" className="motion-chip-in flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-amber-800">
            <span className="font-semibold">A note you didn’t save is kept on this device</span>
            {localDraft.timestamp && <> from <span className="font-mono">{new Date(localDraft.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></>}.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setNote({ ...localDraft.note, patient: lockPatientSelection ? note.patient : localDraft.note.patient });
                setLocalDraft(null);
              }}
              className={`rounded-md bg-brand-teal-dark px-3 py-1.5 font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              Bring it back
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(LOCAL_DRAFT_KEY);
                } catch {
                  // storage unavailable
                }
                setLocalDraft(null);
              }}
              className={`rounded-md border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:border-amber-500 ${FOCUS_RING}`}
            >
              Discard it
            </button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Patient and visit */}
          <Section id={`${ids}-visit`} title="Patient and visit">
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div>
                {lockPatientSelection || editingExisting ? (
                  <>
                    <p className="mb-1.5 text-sm font-medium text-gray-700">Patient</p>
                    <p className="flex h-[38px] items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900">
                        {patient ? `${patient.firstName} ${patient.lastName}` : summary.data ? `${summary.data.patient.firstName} ${summary.data.patient.lastName}` : 'Loading…'}
                      </span>
                      {(patient?.patientCode || summary.data?.patient.patientCode) && (
                        <span className="font-mono text-xs text-gray-500">{patient?.patientCode || summary.data?.patient.patientCode}</span>
                      )}
                    </p>
                  </>
                ) : (
                  <div data-invalid={attempted && Boolean(patientProblem)}>
                    <PatientSearch
                      value={patient}
                      onChange={(p) => {
                        setPicked(p);
                        set('patient', p?._id ?? '');
                      }}
                      autoFocus={!note.patient}
                    />
                    {attempted && patientProblem && <FieldError id={`${ids}-patient-err`}>{patientProblem}</FieldError>}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor={`${ids}-type`}>Visit type</Label>
                <select id={`${ids}-type`} value={note.visitType} onChange={(e) => set('visitType', e.target.value as VisitType)} className={FIELD}>
                  {VISIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`${ids}-cc`}>Chief complaint</Label>
                <input
                  id={`${ids}-cc`}
                  type="text"
                  value={note.chiefComplaint}
                  onChange={(e) => set('chiefComplaint', e.target.value)}
                  placeholder="In the patient’s words, e.g. “cough and fever for 3 days”"
                  className={FIELD}
                />
              </div>
            </div>
          </Section>

          {/* Vital signs */}
          <Section
            id={`${ids}-vitals`}
            title="Vital signs"
            hint={vitalsSource ?? 'Leave blank what wasn’t taken.'}
            aside={
              sentence && !note.soap.objective.includes(sentence) ? (
                <button type="button" onClick={() => set('soap', { ...note.soap, objective: note.soap.objective ? `${sentence}\n${note.soap.objective}` : sentence })} className={ADD_BUTTON}>
                  <Svg d={ICON.arrow} />
                  Copy into the objective note
                </button>
              ) : null
            }
          >
            <VitalsFields value={note.vitals} onChange={(v) => set('vitals', v)} problems={attempted ? vProblems : {}} />
          </Section>

          {/* SOAP */}
          <Section id={`${ids}-soap`} title="SOAP notes">
            <div className="flex flex-col gap-4 px-5 py-4">
              {(
                [
                  { key: 'subjective', label: 'Subjective', hint: 'What the patient reports: symptoms, history, concerns', rows: 4 },
                  { key: 'objective', label: 'Objective', hint: 'What you measured and found on examination', rows: 4 },
                  { key: 'assessment', label: 'Assessment', hint: 'Your impression or differential', rows: 3 },
                  { key: 'plan', label: 'Plan', hint: 'Treatment, tests, advice and follow-up', rows: 3 },
                ] as const
              ).map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`${ids}-${f.key}`}>{f.label}</Label>
                  <NoteArea
                    id={`${ids}-${f.key}`}
                    rows={f.rows}
                    value={note.soap[f.key]}
                    onChange={(v) => set('soap', { ...note.soap, [f.key]: v })}
                    describedBy={`${ids}-${f.key}-hint`}
                  />
                  <p id={`${ids}-${f.key}-hint`} className="mt-1 text-xs text-gray-500">
                    {f.hint}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* History and examination */}
          <Section id={`${ids}-exam`} title="History and examination" hint="Fill in only the systems you examined.">
            <div className="px-5 py-4">
              <Label htmlFor={`${ids}-hpi`} optional>
                History of present illness
              </Label>
              <NoteArea
                id={`${ids}-hpi`}
                rows={3}
                value={note.historyOfPresentIllness}
                onChange={(v) => set('historyOfPresentIllness', v)}
                placeholder="Onset, course and character of the problem"
              />
            </div>
            <dl className="divide-y divide-gray-100 border-t border-gray-100">
              {EXAM.map((x) => (
                <div key={x.key} className="grid gap-1.5 px-5 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start sm:gap-4">
                  <dt className="pt-2 text-sm">
                    <label htmlFor={`${ids}-pe-${x.key}`} className="font-medium text-gray-700">
                      {x.label}
                    </label>
                  </dt>
                  <dd>
                    <NoteArea
                      id={`${ids}-pe-${x.key}`}
                      rows={1}
                      value={note.exam[x.key]}
                      onChange={(v) => set('exam', { ...note.exam, [x.key]: v })}
                      placeholder={x.hint || undefined}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-gray-100 px-5 py-4">
              <Label htmlFor={`${ids}-impression`} optional>
                Admitting impression
              </Label>
              <NoteArea id={`${ids}-impression`} rows={2} value={note.admittingImpression} onChange={(v) => set('admittingImpression', v)} />
            </div>
          </Section>

          {/* Diagnoses */}
          <Section
            id={`${ids}-dx`}
            title="Diagnoses"
            hint={
              <>
                Search by ICD-10 code or words. Mark one as primary.{' '}
                <a href="https://icd.who.int/browse10/2019/en" target="_blank" rel="noopener noreferrer" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  WHO ICD-10 browser
                </a>
              </>
            }
          >
            {note.diagnoses.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {note.diagnoses.map((d, i) => {
                  const label = `Diagnosis ${i + 1}`;
                  return (
                    <li key={d._key} className="motion-row-in grid gap-3 px-5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto_auto] sm:items-center">
                      <Icd10Field
                        id={`${ids}-dx-${d._key}`}
                        rowLabel={label}
                        code={d.code}
                        onCode={(v) => setDx(d._key, { code: v })}
                        onPick={(r) => setDx(d._key, { code: r.code, description: r.description })}
                      />
                      <input
                        type="text"
                        aria-label={`${label}: description`}
                        value={d.description}
                        onChange={(e) => setDx(d._key, { description: e.target.value })}
                        placeholder="Description"
                        className={FIELD}
                      />
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name={`${ids}-primary`}
                          checked={d.primary}
                          onChange={() => setDx(d._key, { primary: true })}
                          className="h-4 w-4 border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
                        />
                        Primary
                      </label>
                      <button type="button" onClick={() => removeDx(d._key)} aria-label={`Remove ${label.toLowerCase()}`} title="Remove" className={REMOVE_BUTTON}>
                        <Svg d={ICON.x} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={`px-5 py-3 ${note.diagnoses.length ? 'border-t border-gray-100' : ''}`}>
              <button type="button" onClick={() => set('diagnoses', [...note.diagnoses, emptyDx(note.diagnoses.length === 0)])} className={ADD_BUTTON}>
                <Svg d="M12 4v16m8-8H4" />
                Add diagnosis
              </button>
            </div>
          </Section>

          {/* Medicines */}
          <Section
            id={`${ids}-meds`}
            title="Medicines"
            hint={editingExisting && initialData?.status !== 'draft' ? 'Changes update this visit’s prescription while nothing has been dispensed.' : 'Saving the visit makes a prescription from these.'}
            aside={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPicker('prescription')} className={ADD_BUTTON}>
                  <Svg d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.11 5.52.44c.5.04.7.66.32.99l-4.2 3.6 1.28 5.38a.56.56 0 01-.84.61L12 16.8l-4.73 2.83a.56.56 0 01-.84-.61l1.28-5.38-4.2-3.6a.56.56 0 01.32-.99l5.52-.44 2.13-5.11z" />
                  My usual
                </button>
                {namedMeds.length > 0 && (
                  <button type="button" onClick={() => setSaveAs('prescription')} className={ADD_BUTTON}>
                    Save these
                  </button>
                )}
              </div>
            }
          >
            {allergies.length > 0 && (
              <p className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
                <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">Allergic to {allergies.map((a) => a.substance).join(', ')}.</span> Check before prescribing.
                </span>
              </p>
            )}
            {note.medications.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {note.medications.map((m, i) => {
                  const problem = attempted ? medProblems[m._key] : undefined;
                  const label = `Medicine ${i + 1}`;
                  return (
                    <li key={m._key} className="motion-row-in px-5 py-4">
                      <WithMedicineValues name={m.name}>
                      {(values) => (
                      <div className="grid gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-6 lg:col-span-3">
                          <Label htmlFor={`${ids}-med-${m._key}`}>{label}</Label>
                          <MedicineNameField
                            id={`${ids}-med-${m._key}`}
                            value={m.name}
                            invalid={Boolean(problem)}
                            describedBy={problem ? `${ids}-med-${m._key}-err` : undefined}
                            onChange={(v) => setMed(m._key, { name: v })}
                            onCreate={(name) => setAddingMed({ key: m._key, name })}
                            onPick={(s) =>
                              setMed(m._key, {
                                name: s.name,
                                ...(s.dosage && !m.dosage ? { dosage: s.dosage } : {}),
                                ...(s.frequency && !m.frequency ? { frequency: s.frequency } : {}),
                                ...(s.duration && !m.duration ? { duration: s.duration } : {}),
                              })
                            }
                          />
                          {problem && <FieldError id={`${ids}-med-${m._key}-err`}>{problem}</FieldError>}
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`${ids}-dose-${m._key}`}>Dose</Label>
                          <ValueField id={`${ids}-dose-${m._key}`} label="Suggested doses" options={values.dosage} value={m.dosage} onChange={(v) => setMed(m._key, { dosage: v })} placeholder="500 mg" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`${ids}-freq-${m._key}`}>How often</Label>
                          <ValueField id={`${ids}-freq-${m._key}`} label="Suggested frequencies" options={values.frequency} value={m.frequency} onChange={(v) => setMed(m._key, { frequency: v })} placeholder="TID" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`${ids}-dur-${m._key}`}>For how long</Label>
                          <ValueField id={`${ids}-dur-${m._key}`} label="Suggested durations" options={values.duration} value={m.duration} onChange={(v) => setMed(m._key, { duration: v })} placeholder="7 days" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`${ids}-qty-${m._key}`}>Quantity</Label>
                          <input
                            id={`${ids}-qty-${m._key}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={m.quantity}
                            onChange={(e) => setMed(m._key, { quantity: e.target.value })}
                            placeholder="21"
                            className={`${FIELD} font-mono tabular-nums`}
                          />
                        </div>
                        <div className="sm:col-span-4 lg:col-span-4">
                          <Label htmlFor={`${ids}-ins-${m._key}`} optional>
                            Instructions
                          </Label>
                          <ValueField
                            id={`${ids}-ins-${m._key}`}
                            label="Suggested instructions"
                            options={values.instructions}
                            value={m.instructions}
                            onChange={(v) => setMed(m._key, { instructions: v })}
                            placeholder="After meals"
                          />
                        </div>
                        <div className="flex items-end justify-end sm:col-span-6 lg:col-span-1">
                          <button
                            type="button"
                            onClick={() => set('medications', note.medications.filter((x) => x._key !== m._key))}
                            aria-label={`Remove ${m.name.trim() || label.toLowerCase()}`}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
                          >
                            <Svg d={ICON.x} />
                            Remove
                          </button>
                        </div>
                      </div>
                      )}
                      </WithMedicineValues>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={`px-5 py-3 ${note.medications.length ? 'border-t border-gray-100' : ''}`}>
              <button type="button" onClick={() => set('medications', [...note.medications, emptyMed()])} className={ADD_BUTTON}>
                <Svg d="M12 4v16m8-8H4" />
                Add medicine
              </button>
            </div>
          </Section>

          {/* Follow-up and notes */}
          <Section id={`${ids}-next`} title="Follow-up and other notes">
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div>
                <Label htmlFor={`${ids}-fu`} optional>
                  Follow-up date
                </Label>
                <input
                  id={`${ids}-fu`}
                  type="date"
                  min={editingExisting ? undefined : todayKey}
                  value={note.followUpDate}
                  onChange={(e) => set('followUpDate', e.target.value)}
                  aria-describedby={`${ids}-fu-hint`}
                  className={`${FIELD} font-mono`}
                />
                <p id={`${ids}-fu-hint`} className="mt-1 text-xs text-gray-500">
                  Booked as an appointment when the visit is closed.
                </p>
              </div>
              <div>
                <Label htmlFor={`${ids}-fu-ins`} optional>
                  Follow-up instructions
                </Label>
                <NoteArea id={`${ids}-fu-ins`} rows={2} value={note.followUpInstructions} onChange={(v) => set('followUpInstructions', v)} placeholder="Return if the fever goes above 38.5 °C" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`${ids}-notes`} optional>
                  Other notes
                </Label>
                <NoteArea id={`${ids}-notes`} rows={2} value={note.notes} onChange={(v) => set('notes', v)} />
              </div>
            </div>
          </Section>

          {/* Signature */}
          <Section id={`${ids}-sign`} title="Signature" hint={signature ? undefined : 'A signed note can be printed as a medical certificate with your signature.'}>
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              {signature ? (
                <div className="flex items-center gap-4">
                  <span className="rounded-md border border-gray-200 bg-white p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- drawn signature, a data URL */}
                    <img src={signature.signatureData} alt={`Signature of ${signature.providerName}`} className="block h-12 max-w-[12rem] object-contain" />
                  </span>
                  <span className="text-sm">
                    <span className="block font-semibold text-gray-900">{signature.providerName}</span>
                    <span className="block text-gray-500">{signedNow ? 'Signed now, saved with the note' : 'Signed'}</span>
                  </span>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Not signed.</p>
              )}
              <button type="button" onClick={() => setShowPad(true)} className={ADD_BUTTON}>
                <Svg d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                {signature ? 'Sign again' : `Sign as ${providerName}`}
              </button>
            </div>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          {note.patient ? (
            <PatientSummary summary={summary} />
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 px-5 py-6 text-center text-sm text-gray-500">Choose the patient to see their allergies, medicines and last visits here.</div>
          )}
        </aside>
      </div>

      {/* Save bar: floats over the bottom of the page while the note is long */}
      <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${draftState?.kind === 'error' || (attempted && problemCount > 0) ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
          {draftState?.kind === 'saving'
            ? 'Saving the draft…'
            : draftState?.kind === 'saved'
              ? 'Draft saved. Only you can see it until the visit is saved.'
              : draftState?.kind === 'error'
                ? draftState.message
                : attempted && problemCount > 0
                  ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing before this can be saved.`
                  : medsToPrescribe > 0 && !(editingExisting && initialData?.status !== 'draft')
                    ? `Saving makes a prescription for ${medsToPrescribe} ${medsToPrescribe === 1 ? 'medicine' : 'medicines'}.`
                    : dirty
                      ? editingExisting
                        ? 'Unsaved changes.'
                        : 'Kept on this device as you type until you save.'
                      : draftId
                        ? 'Draft. Not part of the record until the visit is saved.'
                        : editingExisting
                          ? 'No changes yet.'
                          : ''}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard the changes to this note?')) return;
                onCancel();
              }}
              className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              Cancel
            </button>
          )}
          {canSaveDraft && (
            <button
              type="button"
              onClick={saveDraft}
              disabled={draftState?.kind === 'saving' || submitting}
              className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              Save draft
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Svg d={ICON.check} />
            {submitting ? 'Saving…' : primaryLabel}
          </button>
        </div>
      </div>

      {showPad && (
        <Modal open onOpenChange={(open) => !open && setShowPad(false)} className="max-w-2xl" ariaLabel="Sign the note">
          <div className="p-5">
            <SignaturePad
              providerName={providerName}
              onCancel={() => setShowPad(false)}
              onSave={(data) => {
                setSignature({ providerName, signatureData: data });
                setSignedNow(true);
                setShowPad(false);
              }}
            />
          </div>
        </Modal>
      )}

      {scribeOpen && (
        <ScribePanel open onClose={() => setScribeOpen(false)} patientId={note.patient || undefined} visitType={note.visitType} onApply={applyScribe} />
      )}
      {picker && (
        <TemplatePickerDialog
          open
          onClose={() => setPicker(null)}
          title={picker === 'visit' ? 'Apply a template' : 'Add a saved prescription'}
          kind={picker}
          templates={picker === 'visit' ? visitTemplates : rxTemplates}
          loading={tpl.loading}
          error={tpl.error}
          onPick={pickTemplate}
          emptyHint={
            picker === 'visit'
              ? 'No templates yet. Write a note you use often and choose “Save as template”.'
              : 'No saved prescriptions yet. Add the medicines you usually give and choose “Save these”.'
          }
        />
      )}
      {addingMed && (
        <QuickAddMedicineDialog
          draft={{ ...(note.medications.find((m) => m._key === addingMed.key) ?? emptyMed()), name: addingMed.name }}
          onClose={() => setAddingMed(null)}
          onAdded={(name) => setMed(addingMed.key, { name })}
        />
      )}
      {saveAs && (
        <SaveTemplateDialog
          open
          onClose={() => setSaveAs(null)}
          title={saveAs === 'visit' ? 'Save as template' : 'Save these medicines'}
          description={
            saveAs === 'visit'
              ? 'Saves the note text, exam findings, diagnoses and medicines — not the patient, vital signs or dates. Remove anything specific to this patient first.'
              : `Saves ${namedMeds.length} ${namedMeds.length === 1 ? 'medicine' : 'medicines'} with their doses, so you can add them in one step next time.`
          }
          defaultName={saveAs === 'visit' ? note.diagnoses.find((d) => d.primary)?.description ?? '' : ''}
          onSave={saveTemplate}
        />
      )}
    </form>
    </PhrasesProvider>
  );
}
