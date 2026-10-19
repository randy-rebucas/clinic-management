/**
 * HMO claims: the payer directory, claims sent in transmittals, and their payment.
 * Client-safe: no model imports.
 */
import { roundMoney } from './invoice-totals';

export type HmoKind = 'hmo' | 'insurer' | 'company';
export const HMO_KINDS: HmoKind[] = ['hmo', 'insurer', 'company'];
export const HMO_KIND_LABEL: Record<HmoKind, string> = { hmo: 'HMO', insurer: 'Insurer', company: 'Company account' };

export interface HmoRow {
  _id: string;
  name: string;
  kind: HmoKind;
  code: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTermsDays: number;
  withholdingServicesRate: number;
  withholdingProfessionalRate: number;
  requiresLoa: boolean;
  notes: string;
  active: boolean;
}

export type BatchStatus = 'draft' | 'submitted' | 'partial' | 'paid' | 'closed';
export const BATCH_STATUS: Record<BatchStatus, { label: string; badge: string; hint: string }> = {
  draft: { label: 'Draft', badge: 'bg-white text-gray-700 ring-gray-300', hint: 'Not sent yet; claims can still be added or taken out.' },
  submitted: { label: 'Sent', badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30', hint: 'Waiting for the payer.' },
  partial: { label: 'Part paid', badge: 'bg-amber-50 text-amber-800 ring-amber-200', hint: 'Some claims paid; others still open.' },
  paid: { label: 'Settled', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', hint: 'Every claim paid or denied.' },
  closed: { label: 'Closed', badge: 'bg-white text-gray-500 ring-gray-300', hint: 'Closed by hand; nothing more is expected.' },
};

export type ClaimLineStatus = 'pending' | 'paid' | 'short_paid' | 'denied';
export const CLAIM_LINE_STATUS: Record<ClaimLineStatus, string> = {
  pending: 'Waiting',
  paid: 'Paid',
  short_paid: 'Part refused',
  denied: 'Refused',
};

/**
 * The tax a payer is likely to withhold on a claim: its rate on professional fees for the
 * doctor's share and its rate on services for the rest, on the amount net of VAT (withholding is
 * never on the VAT). Staff confirm the real figure from the payer's remittance and Form 2307.
 */
export function suggestedWithholding(opts: {
  amount: number;
  /** Share of the invoice that is professional fee, 0–1. */
  pfShare: number;
  /** Amount net of VAT ÷ amount, 0–1 (1 when no VAT). */
  netFactor: number;
  servicesRate: number;
  professionalRate: number;
}): number {
  const net = opts.amount * Math.min(1, Math.max(0, opts.netFactor || 1));
  const pf = Math.min(1, Math.max(0, opts.pfShare || 0));
  return roundMoney(net * (pf * (opts.professionalRate / 100) + (1 - pf) * (opts.servicesRate / 100)));
}

/** Why a claim can't go in a transmittal yet, or null. */
export function claimProblem(claim: { loaNumber?: string | null; amount: number }, hmo: { requiresLoa: boolean } | null): string | null {
  if (!(claim.amount > 0)) return 'No amount to claim.';
  if (hmo?.requiresLoa && !String(claim.loaNumber ?? '').trim()) return 'Needs the LOA number from the HMO.';
  return null;
}

export const dueDate = (submittedAt: Date, termsDays: number) => new Date(submittedAt.getTime() + termsDays * 86_400_000);

// ---------------------------------------------------------------------------
// The claims page: what the list can be narrowed to, and the rows it shows
// ---------------------------------------------------------------------------

/** Transmittals still expecting money from the payer. */
export const WAITING_STATUSES: BatchStatus[] = ['submitted', 'partial'];

export type BatchShow = 'waiting' | 'overdue' | 'draft' | 'done';
export const BATCH_SHOWS: { key: BatchShow; label: string }[] = [
  { key: 'waiting', label: 'Waiting for payment' },
  { key: 'overdue', label: 'Past due' },
  { key: 'draft', label: 'Not sent yet' },
  { key: 'done', label: 'Settled or closed' },
];
export const isBatchShow = (v: string | null | undefined): v is BatchShow => BATCH_SHOWS.some((s) => s.key === v);

/** Days since a transmittal was sent, for what is still owed on it. The invoice aging buckets. */
export type OwedAgingKey = '0-30' | '31-60' | '61-90' | '90+';
export const OWED_AGING: { key: OwedAgingKey; label: string; minDays: number; maxDays: number | null }[] = [
  { key: '0-30', label: 'Under 31 days', minDays: 0, maxDays: 30 },
  { key: '31-60', label: '31–60 days', minDays: 31, maxDays: 60 },
  { key: '61-90', label: '61–90 days', minDays: 61, maxDays: 90 },
  { key: '90+', label: 'Over 90 days', minDays: 91, maxDays: null },
];
export const isOwedAgingKey = (v: string | null | undefined): v is OwedAgingKey => OWED_AGING.some((a) => a.key === v);
export const owedAgingOf = (days: number): OwedAgingKey => OWED_AGING.find((a) => days >= a.minDays && (a.maxDays === null || days <= a.maxDays))!.key;

export interface OpenClaim {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  provider: string;
  hmoId: string | null;
  memberId: string;
  loaNumber: string;
  amount: number;
  problem: string | null;
}

/** A draft transmittal claims to that payer can still be added to. */
export interface DraftRef {
  _id: string;
  hmoId: string;
  batchNumber: string;
  claims: number;
}

export interface BatchRow {
  _id: string;
  hmoId: string;
  hmoName: string;
  batchNumber: string;
  status: BatchStatus;
  claims: number;
  /** Claims the payer refused in whole or in part. */
  refused: number;
  totalClaimed: number;
  received: number;
  outstanding: number;
  submittedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
}

export interface HmoInsights {
  toSend: { count: number; amount: number; ready: number; readyAmount: number; needLoa: number; unlisted: number; oldestAt: string | null };
  owed: { amount: number; batches: number; pastDue: { amount: number; batches: number }; aging: { key: OwedAgingKey; amount: number; batches: number }[] };
  drafts: number;
  received30: { amount: number; withheld: number };
  byHmo: {
    hmoId: string;
    name: string;
    active: boolean;
    termsDays: number;
    owed: number;
    pastDue: number;
    toSend: number;
    toSendAmount: number;
    /** Average days from sending to being paid, weighted by amount, over the last 12 months; null when nothing was paid. */
    daysToPay: number | null;
  }[];
}
