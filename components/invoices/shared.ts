import { useMemo } from 'react';
import { STATE } from '../dashboards/charts';
import { makeCompactCurrencyFormatter, makeCurrencyFormatter } from '../dashboards/shared';
import { useSetting } from '../SettingsContext';
import type { InvoiceStatus } from '@/lib/invoices';

/**
 * Invoice states on the validated state hues, by meaning: nothing paid yet = waiting (blue),
 * part paid = amber, paid = teal. Refunded is terminal and neutral: white + gray outline.
 * Shared by the invoices list and the invoice page.
 */
export const INVOICE_STATE: Record<InvoiceStatus, { label: string; fill: string | null; badge: string }> = {
  unpaid: { label: 'Unpaid', fill: STATE.upcoming.fill, badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  partial: { label: 'Part paid', fill: STATE.pending.fill, badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  paid: { label: 'Paid', fill: STATE.completed.fill, badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  refunded: { label: 'Refunded', fill: null, badge: 'bg-white text-gray-600 ring-gray-300' },
};

export type PaymentMethod = 'cash' | 'gcash' | 'card' | 'bank_transfer' | 'check' | 'hmo' | 'insurance' | 'cwt' | 'online' | 'other';

/** In the order a front desk reaches for them. */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; reference: string | null }[] = [
  { value: 'cash', label: 'Cash', reference: null },
  { value: 'gcash', label: 'GCash', reference: 'GCash reference number' },
  { value: 'card', label: 'Card', reference: 'Approval code' },
  { value: 'bank_transfer', label: 'Bank transfer', reference: 'Transfer reference' },
  { value: 'check', label: 'Check', reference: 'Check number' },
  { value: 'hmo', label: 'HMO', reference: 'LOA or approval number' },
  { value: 'insurance', label: 'Insurance', reference: 'Claim number' },
  // Tax a company payer (an HMO, an employer) withholds and certifies on BIR Form 2307; it settles that part of the bill.
  { value: 'cwt', label: 'Withholding tax (2307)', reference: 'Form 2307 period or reference' },
  { value: 'other', label: 'Other', reference: 'Reference' },
];

export const methodLabel = (m: string) => (m === 'online' ? 'Online payment' : PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m);

export const DISCOUNT_LABEL: Record<string, string> = {
  pwd: 'PWD',
  senior: 'Senior citizen',
  membership: 'Membership',
  promotional: 'Promo',
  other: 'Other',
};

export const PF_TYPES: { value: 'consultation' | 'procedure' | 'reading' | 'other'; label: string }[] = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'reading', label: 'Reading' },
  { value: 'other', label: 'Other' },
];

/** The clinic's currency, formatted in full and compact (for chart axes). */
export function useMoney() {
  const currency = useSetting('billingSettings.currency', 'PHP') as string;
  return useMemo(() => ({ money: makeCurrencyFormatter(currency), compact: makeCompactCurrencyFormatter(currency) }), [currency]);
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
