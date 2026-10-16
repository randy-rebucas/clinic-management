/**
 * Invoice list vocabulary shared by the API and the invoices page: which statuses still have
 * money to collect, and the aging buckets an open balance falls into (days since it was billed).
 */

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export const INVOICE_STATUSES: InvoiceStatus[] = ['unpaid', 'partial', 'paid', 'refunded'];
/** Statuses with a balance still to collect. `status=open` on the list means these. */
export const OPEN_STATUSES: InvoiceStatus[] = ['unpaid', 'partial'];

export type AgingKey = '0-30' | '31-60' | '61-90' | '90+';

export const AGING: { key: AgingKey; label: string; minDays: number; maxDays: number | null }[] = [
  { key: '0-30', label: 'Under 31 days', minDays: 0, maxDays: 30 },
  { key: '31-60', label: '31–60 days', minDays: 31, maxDays: 60 },
  { key: '61-90', label: '61–90 days', minDays: 61, maxDays: 90 },
  { key: '90+', label: 'Over 90 days', minDays: 91, maxDays: null },
];

export const isAgingKey = (v: string | null | undefined): v is AgingKey => AGING.some((a) => a.key === v);

const DAY = 86_400_000;

/** The createdAt range for invoices billed between minDays and maxDays ago. */
export function agingRange(key: AgingKey, now = new Date()): { $lte?: Date; $gt?: Date } {
  const bucket = AGING.find((a) => a.key === key)!;
  const range: { $lte?: Date; $gt?: Date } = {};
  if (bucket.minDays > 0) range.$lte = new Date(now.getTime() - bucket.minDays * DAY);
  if (bucket.maxDays !== null) range.$gt = new Date(now.getTime() - (bucket.maxDays + 1) * DAY);
  return range;
}

/** Whole days since a date (0 on the day it was billed). */
export function daysSince(iso: string | Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
}
