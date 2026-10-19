/**
 * PhilHealth claims: the clinic's accreditation, case rates, and the benefit on a bill.
 * Client-safe: no model imports.
 *
 * Claims themselves are filed through PhilHealth's eClaims system by the accredited facility;
 * this tracks them, works out the benefit, and prints the data the claim forms need.
 */
import { roundMoney } from './invoice-totals';

export interface PhilhealthSettings {
  enabled: boolean;
  /** The facility's PhilHealth accreditation number. */
  hciAccreditationNo: string;
  /** Days after the visit (or discharge) a claim must be filed by. */
  filingDays: number;
}

export const PHILHEALTH_DEFAULTS: PhilhealthSettings = { enabled: false, hciAccreditationNo: '', filingDays: 60 };

export function philhealthSettingsOf(raw: unknown): PhilhealthSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<PhilhealthSettings>;
  return {
    enabled: s.enabled === true,
    hciAccreditationNo: String(s.hciAccreditationNo ?? ''),
    filingDays: Number.isFinite(Number(s.filingDays)) && Number(s.filingDays) > 0 ? Number(s.filingDays) : 60,
  };
}

export type CaseRateKind = 'medical' | 'procedure' | 'package';
export const CASE_RATE_KIND_LABEL: Record<CaseRateKind, string> = { medical: 'Medical (ICD-10)', procedure: 'Procedure (RVS)', package: 'Package' };

export interface CaseRateRow {
  _id: string;
  code: string;
  kind: CaseRateKind;
  description: string;
  /** Whole case rate. */
  amount: number;
  /** Facility (HCI) share. */
  hciShare: number;
  /** Professional fee share. */
  pfShare: number;
  active: boolean;
}

export type PhilhealthStatus = 'draft' | 'filed' | 'paid' | 'part_paid' | 'returned' | 'denied';
export const PHILHEALTH_STATUS: Record<PhilhealthStatus, { label: string; badge: string }> = {
  draft: { label: 'To file', badge: 'bg-white text-gray-700 ring-gray-300' },
  filed: { label: 'Filed', badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  returned: { label: 'Returned', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  paid: { label: 'Paid', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  part_paid: { label: 'Part paid', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  denied: { label: 'Denied', badge: 'bg-red-50 text-red-800 ring-red-200' },
};

/** PhilHealth has answered: paid in full, paid less than claimed, or denied. */
export type SettledStatus = 'paid' | 'part_paid' | 'denied';
export const SETTLED_STATUSES: SettledStatus[] = ['paid', 'part_paid', 'denied'];
export const isSettledStatus = (v: string | null | undefined): v is SettledStatus => SETTLED_STATUSES.includes(v as SettledStatus);

/** Paid in full, or less than claimed (the rest stays on the patient's bill). */
export const paidStatusFor = (claimed: number, paid: number, withheld: number): 'paid' | 'part_paid' => (paid + withheld >= claimed - 0.005 ? 'paid' : 'part_paid');

/** A PhilHealth Identification Number has 12 digits, written 12-345678901-2. */
export function isPin(pin: string): boolean {
  return /^\d{12}$/.test(String(pin ?? '').replace(/[\s-]/g, ''));
}
export function formatPin(pin: string): string {
  const d = String(pin ?? '').replace(/\D/g, '');
  return d.length === 12 ? `${d.slice(0, 2)}-${d.slice(2, 11)}-${d.slice(11)}` : String(pin ?? '').trim();
}

/**
 * What PhilHealth pays on a bill under a case rate: the facility share, up to the clinic's own
 * charges, and the professional-fee share, up to the doctor's fee. A rate with no split is
 * capped at the whole bill.
 */
export function philhealthBenefit(rate: { amount: number; hciShare: number; pfShare: number }, bill: { services: number; professionalFee: number }) {
  const services = Math.max(0, bill.services);
  const pf = Math.max(0, bill.professionalFee);
  if (!(rate.hciShare > 0) && !(rate.pfShare > 0)) {
    const total = roundMoney(Math.min(rate.amount, services + pf));
    return { hciAmount: total, pfAmount: 0, total };
  }
  const hciAmount = roundMoney(Math.min(rate.hciShare, services));
  const pfAmount = roundMoney(Math.min(rate.pfShare, pf));
  return { hciAmount, pfAmount, total: roundMoney(hciAmount + pfAmount) };
}

/** Days left to file a claim for a visit on `served` (negative once late). */
export function daysToFile(served: Date | string, filingDays: number, now = new Date()): number {
  const due = new Date(served).getTime() + filingDays * 86_400_000;
  return Math.floor((due - now.getTime()) / 86_400_000);
}

/**
 * Days to answer a return-to-hospital (RTH) notice: "Documents required pursuant to an RTH notice
 * shall be submitted within sixty (60) calendar days from receipt thereof" (PhilHealth Circular
 * 2026-0013, §V.E.13). Fixed by PhilHealth, unlike the clinic's own filing window.
 */
export const RTH_DAYS = 60;

/**
 * The day a claim's window runs from and how long it is: the visit (or discharge) and the
 * clinic's filing window, or, for a claim PhilHealth sent back, the day the notice was received
 * and the RTH window.
 */
export function filingWindow(claim: { servedOn: Date | string; returnedAt?: Date | string | null }, filingDays: number): { from: Date | string; days: number } {
  return claim.returnedAt ? { from: claim.returnedAt, days: RTH_DAYS } : { from: claim.servedOn, days: filingDays };
}

/** Days left to file (or refile) a claim, negative once late. */
export function daysLeftToFile(claim: { servedOn: Date | string; returnedAt?: Date | string | null }, filingDays: number, now = new Date()): number {
  const w = filingWindow(claim, filingDays);
  return daysToFile(w.from, w.days, now);
}

// ---------------------------------------------------------------------------
// The claims page
// ---------------------------------------------------------------------------

/** How close a claim still to file is to its deadline. */
export type DeadlineKey = 'late' | 'week' | 'month' | 'later';
export const DEADLINES: { key: DeadlineKey; label: string }[] = [
  { key: 'late', label: 'Past the deadline' },
  { key: 'week', label: 'Due within 7 days' },
  { key: 'month', label: 'Due in 8–30 days' },
  { key: 'later', label: 'Due later' },
];
export const isDeadlineKey = (v: string | null | undefined): v is DeadlineKey => DEADLINES.some((d) => d.key === v);
export const deadlineOf = (daysLeft: number): DeadlineKey => (daysLeft < 0 ? 'late' : daysLeft <= 7 ? 'week' : daysLeft <= 30 ? 'month' : 'later');

/** How long a filed claim has been waiting on PhilHealth. */
export type WaitKey = '0-30' | '31-60' | '61-90' | '90+';
export const WAITS: { key: WaitKey; label: string; min: number; max: number | null }[] = [
  { key: '0-30', label: 'Under 31 days', min: 0, max: 30 },
  { key: '31-60', label: '31–60 days', min: 31, max: 60 },
  { key: '61-90', label: '61–90 days', min: 61, max: 90 },
  { key: '90+', label: 'Over 90 days', min: 91, max: null },
];
export const isWaitKey = (v: string | null | undefined): v is WaitKey => WAITS.some((w) => w.key === v);
export const waitOf = (days: number): WaitKey => WAITS.find((w) => days >= w.min && (w.max === null || days <= w.max))!.key;

export interface ClaimRow {
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  pin: string;
  relationship: 'member' | 'dependent';
  caseRateCode: string;
  caseRateDescription?: string;
  hciAmount: number;
  pfAmount: number;
  amount: number;
  servedOn: string;
  status: PhilhealthStatus;
  claimNumber?: string;
  filedAt?: string;
  paidAt?: string;
  paidAmount?: number;
  withheldAmount?: number;
  note?: string;
  returnedAt?: string;
  /** Days left to file (negative once late); null once filed or settled. */
  daysLeft: number | null;
  /** The day it must be filed by; null once filed or settled. */
  fileBy: string | null;
}

export interface PhilhealthInsights {
  filingDays: number;
  toFile: { count: number; amount: number; returned: number; deadlines: { key: DeadlineKey; count: number; amount: number }[] };
  filed: { count: number; amount: number; waits: { key: WaitKey; count: number; amount: number }[] };
  /** Paid and denied in the last 90 days. */
  settled90: {
    /** Claims paid, in full or in part. */
    paid: number;
    paidAmount: number;
    withheld: number;
    daysToPay: number | null;
    /** Paid less than claimed, and what PhilHealth cut (now owed by the patients). */
    partPaid: number;
    shortAmount: number;
    denied: number;
    deniedAmount: number;
  };
}
