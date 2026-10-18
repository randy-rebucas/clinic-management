/**
 * The clinic's price list (Service records) as /admin/services shows it, and the one rule for
 * which service a closed visit is billed. Client-safe: no model imports.
 */

import { VISIT_TYPES } from './visit-types';

export const SERVICE_CATEGORIES = ['consultation', 'procedure', 'laboratory', 'imaging', 'medication', 'other'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CATEGORY: Record<ServiceCategory, { label: string; plural: string }> = {
  consultation: { label: 'Consultation', plural: 'Consultations' },
  procedure: { label: 'Procedure', plural: 'Procedures' },
  laboratory: { label: 'Laboratory', plural: 'Laboratory tests' },
  imaging: { label: 'Imaging', plural: 'Imaging' },
  medication: { label: 'Medication', plural: 'Medication' },
  other: { label: 'Other', plural: 'Other' },
};

export const isServiceCategory = (v: unknown): v is ServiceCategory =>
  typeof v === 'string' && (SERVICE_CATEGORIES as readonly string[]).includes(v);

/** Units staff usually pick; any other wording is allowed. */
export const UNIT_SUGGESTIONS = ['per visit', 'per service', 'per test', 'per procedure', 'per session', 'per dose', 'per piece'];

/** What the list shows besides the category filter. */
export const SERVICE_SHOWS = ['on-list', 'off-list', 'unused', 'all'] as const;
export type ServiceShow = (typeof SERVICE_SHOWS)[number];
export const SERVICE_SHOW_LABEL: Record<ServiceShow, string> = {
  'on-list': 'On the price list',
  'off-list': 'Taken off the list',
  unused: 'Not billed in 90 days',
  all: 'Everything',
};
export const isServiceShow = (v: unknown): v is ServiceShow => typeof v === 'string' && (SERVICE_SHOWS as readonly string[]).includes(v);

/** How far back the page looks at invoices. */
export const USAGE_DAYS = 90;

/**
 * Closing a visit with no matching service bills this fixed amount
 * (`lib/automations/invoice-generation.ts`). Nothing in Settings changes it.
 */
export const FALLBACK_VISIT_FEE = 500;

export interface ServiceUsage {
  /** Invoice lines that charged this service. */
  lines: number;
  quantity: number;
  amount: number;
  lastBilled: string;
}

export interface ServiceRow {
  _id: string;
  code: string;
  name: string;
  description: string | null;
  category: ServiceCategory;
  /** For consultations: the visit type it is billed for when a visit closes. */
  type: string | null;
  unitPrice: number;
  unit: string;
  duration: number | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** null when the viewer may not see billing, or nothing was billed in the window. */
  usage: ServiceUsage | null;
}

/** A charge typed on invoices by hand (no price-list service behind it). */
export interface TypedCharge {
  label: string;
  lines: number;
  /** The middle price it was charged at. */
  typicalPrice: number;
  /** Name of an active service with the same name, when there is one. */
  sameAs: string | null;
}

export interface ServicesPageData {
  rows: ServiceRow[];
  truncated: boolean;
  currency: string;
  /** Settings → automatic invoice when a visit is closed. */
  autoBilling: boolean;
  usage: {
    since: string;
    /** Every invoice line in the window that isn't refunded. */
    totalLines: number;
    typedLines: number;
    typed: TypedCharge[];
    /** Visits billed the fixed fallback fee because no service matched. */
    fallbackLines: number;
  } | null;
  can: { write: boolean; remove: boolean };
  now: string;
}

// ---------------------------------------------------------------------------
// Which service a closed visit is billed
// ---------------------------------------------------------------------------

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface FeeCandidate {
  _id: unknown;
  name: string;
  category: string;
  type?: string | null;
  unitPrice: number;
  active: boolean;
}

/**
 * The service billed when a visit of `visitType` is closed: an active consultation whose visit
 * type is set to it, else one with the visit type in its name; the dearest wins a tie.
 * Used by the automatic invoice and by the page, so what the page says is what gets billed.
 */
export function pickVisitFee<T extends FeeCandidate>(services: T[], visitType: string): { service: T; how: 'set' | 'name' } | null {
  const want = norm(visitType);
  if (!want) return null;
  const pool = services.filter((s) => s.active && s.category === 'consultation');
  const dearest = (list: T[]) => list.reduce<T | null>((best, s) => (!best || s.unitPrice > best.unitPrice ? s : best), null);
  const set = dearest(pool.filter((s) => norm(s.type) === want));
  if (set) return { service: set, how: 'set' };
  const named = dearest(pool.filter((s) => norm(s.name).includes(want)));
  return named ? { service: named, how: 'name' } : null;
}

/** The visit type a stored `type` means, when it means one. */
export const visitTypeOf = (type: string | null | undefined) => VISIT_TYPES.find((t) => norm(t.value) === norm(type))?.value ?? null;

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/** CONS, PROC, LABO, IMAG, MEDI, OTHE: the prefix of codes the server makes up. */
export const codePrefix = (category: ServiceCategory) => category.toUpperCase().slice(0, 4);

/** The code the server will give a new service left without one. */
export function nextCode(codes: string[], category: ServiceCategory) {
  const prefix = codePrefix(category);
  const n = codes.reduce((max, c) => {
    const m = c.toUpperCase().startsWith(prefix) ? c.match(/(\d+)$/) : null;
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `${prefix}-${String(n + 1).padStart(3, '0')}`;
}
