type InvoiceLike = { total?: number | null; status?: string | null; payments?: Array<{ amount?: number | null }> | null };

/** Statuses that owe nothing, whatever the recorded payments add up to (e.g. a waived remainder). */
const SETTLED_STATUSES = new Set(['paid', 'refunded']);

/**
 * What the patient has paid on an invoice and what is still owed. Paid and refunded invoices
 * owe nothing; otherwise balance = total - payments, floored at 0. The list summary and the
 * detail route both use this so their numbers always agree.
 */
export function invoiceBalance(invoice: InvoiceLike): { paid: number; balance: number } {
  const paid = (invoice.payments ?? []).reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  if (invoice.status && SETTLED_STATUSES.has(invoice.status)) return { paid, balance: 0 };
  return { paid, balance: Math.max(0, (Number(invoice.total) || 0) - paid) };
}
