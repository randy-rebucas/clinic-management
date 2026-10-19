/**
 * Clinical templates, saved prescriptions and phrase macros — shared by the API and the
 * visit/prescription forms. Pure and client-safe (no database access).
 */

export type TemplateKind = 'visit' | 'prescription' | 'phrase';

export interface TemplateMedication {
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
}

export interface TemplateVisitContent {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  physicalExam?: Record<string, string>;
  diagnoses?: Array<{ code?: string; description?: string; primary?: boolean }>;
  followUpInstructions?: string;
}

/** A template as the API returns it. */
export interface ClinicalTemplateDTO {
  _id: string;
  kind: TemplateKind;
  name: string;
  specialty?: string;
  shared: boolean;
  /** True when the signed-in user may edit or delete it. */
  mine: boolean;
  ownerName?: string;
  shortcut?: string;
  text?: string;
  visit?: TemplateVisitContent;
  medications?: TemplateMedication[];
  usageCount: number;
  /** Built-in starter, not stored; id starts with "starter:". */
  starter?: boolean;
}

export const SHORTCUT_RE = /^[a-z0-9][a-z0-9-]{0,19}$/;

// ---------------------------------------------------------------------------
// Phrase macros
// ---------------------------------------------------------------------------

export interface MacroExpansion {
  value: string;
  caret: number;
  shortcut: string;
}

/**
 * Expand ".shortcut" when the character just typed (at caret-1) is a space or newline and the
 * word before it is a known shortcut starting with a dot at a word boundary.
 * Returns null when there is nothing to expand.
 *
 *   expandMacro("Pt has .urti ", 13, {urti: "upper respiratory tract infection"})
 *   → { value: "Pt has upper respiratory tract infection ", caret: 41 }
 */
export function expandMacro(value: string, caret: number, phrases: ReadonlyMap<string, string>): MacroExpansion | null {
  if (caret < 3 || phrases.size === 0) return null;
  const typed = value[caret - 1];
  if (typed !== ' ' && typed !== '\n') return null;
  const before = value.slice(0, caret - 1);
  const match = /(^|[\s(])\.([a-z0-9][a-z0-9-]{0,19})$/i.exec(before);
  if (!match) return null;
  const shortcut = match[2].toLowerCase();
  const text = phrases.get(shortcut);
  if (text === undefined) return null;
  const start = before.length - shortcut.length - 1;
  const next = value.slice(0, start) + text + typed + value.slice(caret);
  return { value: next, caret: start + text.length + 1, shortcut };
}

// ---------------------------------------------------------------------------
// Applying templates
// ---------------------------------------------------------------------------

/** Fill `current` only when it is blank; report whether the template's text was skipped. */
export function fillBlank(current: string, incoming: string | undefined): { value: string; skipped: boolean } {
  const add = (incoming ?? '').trim();
  if (!add) return { value: current, skipped: false };
  if (!current.trim()) return { value: add, skipped: false };
  return { value: current, skipped: current.trim() !== add };
}

/** Append template diagnoses not already on the note (same code, or same description without code). */
export function mergeDiagnoses<T extends { code: string; description: string; primary: boolean }>(
  current: T[],
  incoming: TemplateVisitContent['diagnoses'],
  make: (d: { code: string; description: string; primary: boolean }) => T
): T[] {
  const seen = new Set(current.map((d) => (d.code.trim() || d.description.trim()).toUpperCase()).filter(Boolean));
  const kept = current.filter((d) => d.code.trim() || d.description.trim());
  const out = [...kept];
  for (const d of incoming ?? []) {
    const code = (d.code ?? '').trim().toUpperCase();
    const description = (d.description ?? '').trim();
    const key = (code || description).toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(make({ code, description, primary: false }));
  }
  if (out.length && !out.some((d) => d.primary)) out[0] = { ...out[0], primary: true };
  return out;
}

/** Append template medicines whose name is not already on the list. */
export function mergeMedications<T extends { name: string }>(
  current: T[],
  incoming: TemplateMedication[] | undefined,
  make: (m: TemplateMedication) => T,
  isBlank: (m: T) => boolean = (m) => !m.name.trim()
): T[] {
  const kept = current.filter((m) => !isBlank(m));
  const names = new Set(kept.map((m) => m.name.trim().toLowerCase()));
  const out = [...kept];
  for (const m of incoming ?? []) {
    const key = m.name.trim().toLowerCase();
    if (!key || names.has(key)) continue;
    names.add(key);
    out.push(make(m));
  }
  return out;
}

/** "7 days" → 7, "2 weeks" → 14, "1 month" → 30; null when not a duration. */
export function durationToDays(duration: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|mo|month|months)?\b/i.exec((duration ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'd').toLowerCase();
  const days = unit.startsWith('w') ? n * 7 : unit.startsWith('mo') ? n * 30 : n;
  return Number.isFinite(days) && days > 0 ? Math.round(days) : null;
}

// ---------------------------------------------------------------------------
// Starter library
// ---------------------------------------------------------------------------

/**
 * Built-in note skeletons for common outpatient visits, offered next to the user's own
 * templates. They carry structure and ICD-10 codes only — no medicines or doses, which
 * depend on the patient — and blanks (___) for the doctor to complete.
 */
const starter = (
  slug: string,
  name: string,
  specialty: string,
  visit: TemplateVisitContent
): ClinicalTemplateDTO => ({
  _id: `starter:${slug}`,
  kind: 'visit',
  name,
  specialty,
  shared: true,
  mine: false,
  usageCount: 0,
  starter: true,
  visit,
});

export const STARTER_TEMPLATES: ClinicalTemplateDTO[] = [
  starter('urti', 'Upper respiratory tract infection', 'General / Family Medicine', {
    chiefComplaint: 'Cough and colds',
    soapNotes: {
      subjective: 'Cough for ___ days, productive/non-productive. Colds, sore throat: ___. Fever: ___ (Tmax ___). No difficulty of breathing. No known sick contacts / sick contacts: ___.',
      objective: 'Awake, not in respiratory distress. Pharynx: ___. Tonsils: ___. Lungs: ___.',
      assessment: 'Acute upper respiratory tract infection',
      plan: 'Supportive care, increase oral fluids, rest. Return if with difficulty of breathing, persistent fever beyond 3 days, or worsening symptoms.',
    },
    diagnoses: [{ code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', primary: true }],
  }),
  starter('age', 'Acute gastroenteritis', 'General / Family Medicine', {
    chiefComplaint: 'Loose bowel movement',
    soapNotes: {
      subjective: 'LBM for ___ days, ___ episodes/day, watery/with blood or mucus: ___. Vomiting: ___. Abdominal pain: ___. Fever: ___. Oral intake: ___. Urine output: ___.',
      objective: 'Hydration status: ___. Abdomen: ___.',
      assessment: 'Acute gastroenteritis, ___ dehydration',
      plan: 'Oral rehydration. Diet as tolerated. Return if unable to keep fluids down, blood in stools, decreased urine output, or lethargy.',
    },
    diagnoses: [{ code: 'A09', description: 'Other gastroenteritis and colitis of infectious and unspecified origin', primary: true }],
  }),
  starter('htn-fu', 'Hypertension follow-up', 'Internal Medicine', {
    chiefComplaint: 'Follow-up of blood pressure',
    soapNotes: {
      subjective: 'Home BP readings: ___. Compliance with maintenance medicines: ___. Headache, chest pain, dyspnea, edema: ___.',
      objective: 'BP ___ mmHg, HR ___. Heart: ___. Lungs: ___. Extremities: ___.',
      assessment: 'Essential hypertension, ___ controlled',
      plan: 'Continue maintenance medicines. Low-salt diet, regular exercise. Labs: ___. Follow-up in ___ weeks with BP log.',
    },
    diagnoses: [{ code: 'I10', description: 'Essential (primary) hypertension', primary: true }],
  }),
  starter('dm-fu', 'Type 2 diabetes follow-up', 'Internal Medicine', {
    chiefComplaint: 'Follow-up of diabetes',
    soapNotes: {
      subjective: 'Home CBG readings: ___. Compliance: ___. Hypoglycemic episodes: ___. Polyuria/polydipsia: ___. Numbness of feet: ___.',
      objective: 'Weight ___ kg, BMI ___. Foot exam: ___.',
      assessment: 'Type 2 diabetes mellitus, ___ controlled',
      plan: 'Continue medicines. Diet and exercise counseling. Labs: FBS/HbA1c, lipid profile, creatinine: ___. Follow-up in ___ months.',
    },
    diagnoses: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', primary: true }],
  }),
  starter('uti', 'Uncomplicated urinary tract infection', 'General / Family Medicine', {
    chiefComplaint: 'Dysuria',
    soapNotes: {
      subjective: 'Dysuria, frequency, urgency for ___ days. Flank pain: ___. Fever: ___. LMP (if applicable): ___.',
      objective: 'CVA tenderness: ___. Urinalysis: ___.',
      assessment: 'Uncomplicated urinary tract infection',
      plan: 'Increase oral fluids. Return if with fever, flank pain, or no improvement in 48–72 hours.',
    },
    diagnoses: [{ code: 'N39.0', description: 'Urinary tract infection, site not specified', primary: true }],
  }),
  starter('well-child', 'Well-child visit', 'Pediatrics', {
    chiefComplaint: 'Routine check-up',
    soapNotes: {
      subjective: 'Feeding: ___. Sleep: ___. Developmental milestones: ___. Immunizations up to date: ___.',
      objective: 'Weight ___ kg (___ percentile), length/height ___ cm (___ percentile), head circumference ___ cm.',
      assessment: 'Well child, growth and development appropriate for age: ___',
      plan: 'Anticipatory guidance: ___. Vaccines due: ___. Next visit: ___.',
    },
    diagnoses: [{ code: 'Z00.1', description: 'Routine child health examination', primary: true }],
  }),
  starter('prenatal', 'Prenatal visit', 'Obstetrics and Gynecology', {
    chiefComplaint: 'Prenatal check-up',
    soapNotes: {
      subjective: 'G_P_ (____), ___ weeks AOG by LMP/UTZ. Fetal movement: ___. Bleeding, watery discharge, contractions, headache, blurring of vision: ___.',
      objective: 'BP ___, weight ___ kg. Fundic height ___ cm. FHT ___ bpm. Edema: ___.',
      assessment: 'Pregnancy uterine, ___ weeks AOG',
      plan: 'Continue prenatal vitamins. Labs: ___. Danger signs discussed. Next visit in ___ weeks.',
    },
    diagnoses: [{ code: 'Z34.9', description: 'Supervision of normal pregnancy, unspecified', primary: true }],
  }),
  starter('ape', 'Annual physical examination', 'General / Family Medicine', {
    chiefComplaint: 'Annual physical examination',
    soapNotes: {
      subjective: 'No complaints / complaints: ___. Past medical history: ___. Medicines: ___. Smoking/alcohol: ___.',
      objective: 'General: ___. HEENT: ___. Heart and lungs: ___. Abdomen: ___. Extremities: ___.',
      assessment: 'Fit to work / ___',
      plan: 'Labs: CBC, urinalysis, chest X-ray: ___. Health counseling: ___.',
    },
    diagnoses: [{ code: 'Z00.0', description: 'General adult medical examination', primary: true }],
  }),
];
