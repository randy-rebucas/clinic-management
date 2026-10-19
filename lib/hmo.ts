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
  short_paid: 'Short paid',
  denied: 'Denied',
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
