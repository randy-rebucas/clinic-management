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

export type PhilhealthStatus = 'draft' | 'filed' | 'paid' | 'returned' | 'denied';
export const PHILHEALTH_STATUS: Record<PhilhealthStatus, { label: string; badge: string }> = {
  draft: { label: 'To file', badge: 'bg-white text-gray-700 ring-gray-300' },
  filed: { label: 'Filed', badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  returned: { label: 'Returned', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  paid: { label: 'Paid', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  denied: { label: 'Denied', badge: 'bg-red-50 text-red-800 ring-red-200' },
};

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
