/**
 * The clinic's medicines list (Medicine records) as /admin/medicines shows it. Doctors pick
 * from it when they prescribe: the prescription form copies the form, strength and route and
 * fills the dose and frequency (from a dose by age or weight when one fits the patient, else
 * the usual dose); the visit note's medicine picker fills dose, frequency and duration.
 * Client-safe: no model imports.
 */

export const MEDICINE_FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other'] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];
export const FORM_LABEL: Record<MedicineForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  syrup: 'Syrup',
  injection: 'Injection',
  cream: 'Cream',
  drops: 'Drops',
  inhaler: 'Inhaler',
  other: 'Other',
};
export const isMedicineForm = (v: unknown): v is MedicineForm => typeof v === 'string' && (MEDICINE_FORMS as readonly string[]).includes(v);

export const MEDICINE_ROUTES = ['oral', 'iv', 'im', 'topical', 'inhalation', 'ophthalmic', 'otic', 'other'] as const;
export type MedicineRoute = (typeof MEDICINE_ROUTES)[number];
export const ROUTE_LABEL: Record<MedicineRoute, string> = {
  oral: 'By mouth',
  iv: 'Into a vein (IV)',
  im: 'Into a muscle (IM)',
  topical: 'On the skin',
  inhalation: 'Inhaled',
  ophthalmic: 'In the eye',
  otic: 'In the ear',
  other: 'Other',
};
export const isMedicineRoute = (v: unknown): v is MedicineRoute => typeof v === 'string' && (MEDICINE_ROUTES as readonly string[]).includes(v);

/** Wordings the prescription form counts doses from (see `timesPerDay`). */
export const FREQUENCY_SUGGESTIONS = ['Once daily', 'BID (twice a day)', 'TID (three times a day)', 'QID (four times a day)', 'Every 8 hours', 'Every 6 hours', 'Once daily at bedtime'];
export const DURATION_SUGGESTIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days'];

/** How far back the page looks at prescriptions. */
export const USAGE_DAYS = 90;

/** What the list shows besides the category filter. */
export const MEDICINE_SHOWS = ['on-list', 'off-list', 'controlled', 'no-dose', 'unused', 'not-stocked', 'all'] as const;
export type MedicineShow = (typeof MEDICINE_SHOWS)[number];
export const MEDICINE_SHOW_LABEL: Record<MedicineShow, string> = {
  'on-list': 'On the list',
  'off-list': 'Taken off the list',
  controlled: 'Controlled substances',
  'no-dose': 'No usual dose set',
  unused: `Not prescribed in ${USAGE_DAYS} days`,
  'not-stocked': 'Prescribed, not stocked',
  all: 'Everything',
};
export const isMedicineShow = (v: unknown): v is MedicineShow => typeof v === 'string' && (MEDICINE_SHOWS as readonly string[]).includes(v);

/** Lower-case, trimmed, single-spaced: how names are compared across prescriptions and stock. */
export const nameKey = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The unit a strength is measured in ("500mg" → mg, "250mg/5ml" → mg, "100IU/ml" → IU), stored
 * beside it because the schema requires one. Nothing asks staff for it separately.
 */
export function unitOf(strength: string): string {
  const m = strength.match(/(mcg|µg|mg|g|ml|l|iu|units?|%)(?![a-z])/i);
  if (!m) return 'unit';
  const u = m[1].toLowerCase();
  return u === 'iu' ? 'IU' : u === 'µg' ? 'mcg' : u === 'units' ? 'unit' : u;
}

export interface DoseRange {
  minAge: number | null;
  maxAge: number | null;
  minWeight: number | null;
  maxWeight: number | null;
  dose: string;
  frequency: string;
  maxDailyDose: string | null;
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';

export interface MedicineStock {
  /** Stock items for this medicine: linked to it, or unlinked with the same name. */
  items: number;
  quantity: number;
  unit: string;
  /** The worst state among them. */
  status: StockStatus;
  /** The item to open when there is only one. */
  itemId: string | null;
}

export interface MedicineRow {
  _id: string;
  name: string;
  genericName: string | null;
  brandNames: string[];
  form: MedicineForm;
  strength: string;
  route: MedicineRoute;
  category: string;
  indications: string[];
  contraindications: string[];
  sideEffects: string[];
  dosageRanges: DoseRange[];
  standardDosage: string | null;
  standardFrequency: string | null;
  duration: string | null;
  requiresPrescription: boolean;
  controlledSubstance: boolean;
  schedule: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Prescription lines naming it in the window (null when none, or the viewer can't see prescriptions). */
  usage: { lines: number; last: string } | null;
  /** null when it has no stock item, or the viewer can't see stock. */
  stock: MedicineStock | null;
}

/** A medicine prescribed by typing its name: it matches nothing on the list. */
export interface WrittenIn {
  name: string;
  lines: number;
  last: string;
  dose: string | null;
  frequency: string | null;
}

export interface MedicinesPageData {
  rows: MedicineRow[];
  truncated: boolean;
  usage: {
    since: string;
    /** Medicine lines on prescriptions in the window, cancelled prescriptions left out. */
    totalLines: number;
    prescriptions: number;
    writtenInLines: number;
    writtenIn: WrittenIn[];
  } | null;
  /** The viewer may see stock, so rows carry it. */
  stockVisible: boolean;
  can: { write: boolean };
  now: string;
}

/** Nothing for a doctor's picker to fill in beyond form and strength. */
export const hasNoDose = (r: Pick<MedicineRow, 'standardDosage' | 'standardFrequency' | 'dosageRanges'>) =>
  !r.standardDosage && !r.standardFrequency && r.dosageRanges.length === 0;

/** "500mg · TID · 7 days", or null when nothing is set. */
export function usualLine(r: Pick<MedicineRow, 'standardDosage' | 'standardFrequency' | 'duration'>) {
  const parts = [r.standardDosage, r.standardFrequency, r.duration].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "Ages 2–12", "Under 2 years", "Over 40 kg", "Ages 2–12, 10–30 kg". */
export function rangeLabel(r: Pick<DoseRange, 'minAge' | 'maxAge' | 'minWeight' | 'maxWeight'>) {
  const span = (lo: number | null, hi: number | null, unit: string, noun: string) => {
    if (lo === null && hi === null) return null;
    if (lo !== null && hi !== null) return `${noun ? `${noun} ` : ''}${lo}–${hi}${unit}`;
    return lo !== null ? `${lo}${unit} and over` : `Up to ${hi}${unit}`;
  };
  const age = span(r.minAge, r.maxAge, ' years', 'Ages');
  const weight = span(r.minWeight, r.maxWeight, ' kg', '');
  return [age, weight].filter(Boolean).join(', ') || 'Anyone';
}
